#!/usr/bin/env bash
# End-to-end HTTP smoke test: drives a running dev/prod server through every
# surface of the product — public pages, a real signup, the onboarding popup,
# the teacher/parent/student apps, role boundaries, the public booking flow
# (including its race), and the operator console — then deletes every row it
# created. The database is the SHARED one, so every mutation here is either
# on a throwaway school, a vfy_/smoke-prefixed row, or reverted.
#
# Requires: server on 127.0.0.1:3000 with ROOT_DOMAIN="localhost:3000",
# seeded demo school (sarah/dana/eli @ demo1234), node + .env with DIRECT_URL.
#
#   bash scripts/smoke-e2e.sh
set -u
BASE="http://localhost:3000"
CONNECT=(--connect-to "::127.0.0.1:")
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check() { # check <name> <needle> <haystack>
  if grep -q "$2" <<<"$3"; then ok "$1"; else bad "$1 (missing: $2)"; fi
}
status() { # status <name> <expected> <actual>
  if [ "$3" = "$2" ]; then ok "$1"; else bad "$1 (want $2, got $3)"; fi
}
aid_of() { grep -o 'name="\$ACTION_ID_[^"]*"' <<<"$1" | head -1 | sed 's/name="//;s/"$//'; }

SLUG="smoke-$(date +%s)"
JAR=$(mktemp -d)
trap 'rm -rf "$JAR"' EXIT

echo "== 1. Public apex =="
H=$(curl -s "${CONNECT[@]}" "$BASE/")
check "landing renders" "The system that gets a microschool paid" "$H"
check "landing has walkthrough CTA" 'href="/book"' "$H"
status "states index 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${CONNECT[@]}" "$BASE/states")"
status "state page 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${CONNECT[@]}" "$BASE/states/arizona")"
status "find page 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${CONNECT[@]}" "$BASE/find")"
status "signup page 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${CONNECT[@]}" "$BASE/signup")"
# Family tier: both tiers on the landing, family chooser renders, and the
# family signup page shows no ESA-amount field.
check "landing has family tier" 'href="/signup?kind=family"' "$H"
check "landing states family price" '\$29' "$H"
FS=$(curl -s "${CONNECT[@]}" "$BASE/signup?kind=family")
check "family signup renders chooser" 'A homeschooling family' "$FS"
check "family signup asks family name" 'Family name' "$FS"
if echo "$FS" | grep -q 'id="esaAmount"'; then bad "family signup must not ask ESA amount"; else ok "family signup omits ESA amount"; fi
check "robots blocks console" "Disallow: /cohort-admin" "$(curl -s "${CONNECT[@]}" "$BASE/robots.txt")"
status "sitemap 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${CONNECT[@]}" "$BASE/sitemap.xml")"
R=$(curl -s -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" "$BASE/dashboard")
check "apex app route bounces home" "$BASE/" "$R"
R=$(curl -s -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" "$BASE/login")
check "apex login goes to school finder" "/find" "$R"

echo "== 2. Booking page =="
B=$(curl -s "${CONNECT[@]}" "$BASE/book")
status "book page 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${CONNECT[@]}" "$BASE/book")"
if grep -qE "20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00\.000Z" <<<"$B"; then ok "open times generated from rules"; else check "book empty-state honest" "Nothing on the calendar" "$B"; fi

echo "== 3. Signup → new school =="
S=$(curl -s -c "$JAR/owner" "${CONNECT[@]}" "$BASE/signup")
AID=$(aid_of "$S")
R=$(curl -s -b "$JAR/owner" -c "$JAR/owner" -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" \
  -X POST "$BASE/signup" \
  --form-string "$AID=" \
  --form-string "schoolName=Smoke Test School" \
  --form-string "slug=$SLUG" \
  --form-string "state=AZ" \
  --form-string "esaAmount=7000" \
  --form-string "name=Smokey Tester" \
  --form-string "email=owner@$SLUG.test" \
  --form-string "password=smoke-Pass-1122!")
check "signup redirects to school handoff" "$SLUG.localhost:3000/enter" "$R"
TEN="http://$SLUG.localhost:3000"
D=$(curl -s -L -b "$JAR/owner" -c "$JAR/owner" "${CONNECT[@]}" "$R")
check "owner lands on dashboard" "Good morning" "$D"
check "onboarding popup shows" "A minute of setup" "$D"

echo "== 4. Onboarding popup =="
AID=$(aid_of "$D")
curl -s -b "$JAR/owner" -c "$JAR/owner" -o /dev/null "${CONNECT[@]}" \
  -X POST "$TEN/dashboard" \
  --form-string "$AID=" \
  --form-string "contactPhone=(555) 000-1111" \
  --form-string "studentEstimate=9" \
  --form-string "gradesServed=K-5" \
  --form-string "heardFrom=search" \
  --form-string "priorTooling=spreadsheets"
D=$(curl -s -b "$JAR/owner" "${CONNECT[@]}" "$TEN/dashboard")
if grep -q "A minute of setup" <<<"$D"; then bad "popup dismissed after save"; else ok "popup dismissed after save"; fi
OB=$(node --input-type=module -e '
import { readFileSync } from "node:fs"; import pg from "pg";
const env = readFileSync(".env","utf8");
const c = new pg.Client({connectionString: env.match(/^DIRECT_URL="?([^"\n]+?)"?$/m)[1]});
await c.connect();
const r = await c.query(`SELECT "studentEstimate", "gradesServed", "heardFrom" FROM "School" WHERE slug=$1`, [process.argv[1]]);
console.log(JSON.stringify(r.rows[0] ?? {})); await c.end();' "$SLUG")
check "onboarding answers stored" '"studentEstimate":9' "$OB"

echo "== 5. Teacher route sweep (new school) =="
for p in /dashboard /students /attendance /assignments /grading /invoices /evidence /calendar /settings /gradebook /reports /banks /announcements /conferences /audit /billing /cashflow /paths /outcomes /worksheets /syllabus; do
  status "owner $p" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/owner" "${CONNECT[@]}" "$TEN$p")"
done

echo "== 6. Demo school: all three roles =="
L=$(curl -s -c "$JAR/sarah" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/login")
AID=$(aid_of "$L")
curl -s -b "$JAR/sarah" -c "$JAR/sarah" -o /dev/null "${CONNECT[@]}" -X POST "http://cedar-grove.localhost:3000/login" \
  --form-string "$AID=" --form-string "email=sarah@cedargrove.school" --form-string "password=demo1234"
T=$(curl -s -b "$JAR/sarah" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/dashboard")
check "teacher dashboard (data-rich)" "invoice-ready" "$T"
check "teacher triage is clickable" 'class="rowitem attnrow"' "$T"
L=$(curl -s -c "$JAR/dana" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/login"); AID=$(aid_of "$L")
curl -s -b "$JAR/dana" -c "$JAR/dana" -o /dev/null "${CONNECT[@]}" -X POST "http://cedar-grove.localhost:3000/login" \
  --form-string "$AID=" --form-string "email=dana@example.com" --form-string "password=demo1234"
P=$(curl -s -b "$JAR/dana" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/parent")
check "parent dashboard" "week" "$P"
for p in /parent/feed /parent/children /parent/tuition /parent/messages; do
  status "parent $p" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/dana" "${CONNECT[@]}" "http://cedar-grove.localhost:3000$p")"
done
L=$(curl -s -c "$JAR/eli" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/login"); AID=$(aid_of "$L")
curl -s -b "$JAR/eli" -c "$JAR/eli" -o /dev/null "${CONNECT[@]}" -X POST "http://cedar-grove.localhost:3000/login" \
  --form-string "$AID=" --form-string "email=eli@cedargrove.school" --form-string "password=demo1234"
ST=$(curl -s -b "$JAR/eli" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/student")
check "student dashboard" "day streak" "$ST"
for p in /student/work /student/trophies; do
  status "student $p" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/eli" "${CONNECT[@]}" "http://cedar-grove.localhost:3000$p")"
done

echo "== 7. Role boundaries =="
S1=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/eli" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/dashboard")
if [ "$S1" != "200" ]; then ok "student refused teacher dashboard ($S1)"; else bad "student reached teacher dashboard"; fi
S2=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/dana" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/students")
if [ "$S2" != "200" ]; then ok "parent refused roster ($S2)"; else bad "parent reached roster"; fi
# The schools page streams its skeleton before the gate fires, so the refusal
# is an in-stream redirect, not an HTTP 3xx: assert the redirect marker is
# present AND no real school data made it into the stream.
S3=$(curl -s "${CONNECT[@]}" "$BASE/cohort-admin/schools")
if grep -q "cohort-admin/login" <<<"$S3" && ! grep -q "Cedar Grove" <<<"$S3"; then
  ok "console refuses anonymous (streamed redirect, no data)"
else
  bad "console refuses anonymous"
fi
S4=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/sarah" "${CONNECT[@]}" "http://cedar-grove.localhost:3000/cohort-admin")
if [ "$S4" != "200" ]; then ok "console refuses school teacher ($S4)"; else bad "teacher reached console"; fi

echo "== 8. Booking flow + race =="
B=$(curl -s "${CONNECT[@]}" "$BASE/book")
FIRSTISO=$(grep -oE "20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00\.000Z" <<<"$B" | head -1)
if [ -n "$FIRSTISO" ]; then
  # The booking form is client-rendered, so its action id isn't in the HTML.
  # The server's own reference manifest knows it — /book has exactly one action.
  BOOKID=$(node -e '
    for (const p of [".next/dev/server/app/book/page/server-reference-manifest.json", ".next/server/app/book/page/server-reference-manifest.json"]) {
      try { const m = require(require("path").resolve(p)); console.log(Object.keys(m.node ?? m)[0]); process.exit(0); } catch {}
    }
    process.exit(1);')
  AID="\$ACTION_ID_$BOOKID"
  R=$(curl -s -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" -X POST "$BASE/book" \
    --form-string "$AID=" --form-string "startsAt=$FIRSTISO" \
    --form-string "name=Smoke Booker" --form-string "email=booker@$SLUG.test" \
    --form-string "state=Utah")
  check "booking succeeds" "booked=1" "$R"
  R=$(curl -s -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" -X POST "$BASE/book" \
    --form-string "$AID=" --form-string "startsAt=$FIRSTISO" \
    --form-string "name=Smoke Loser" --form-string "email=loser@$SLUG.test" \
    --form-string "state=Utah")
  check "race loser told taken" "error=taken" "$R"
  R=$(curl -s -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" -X POST "$BASE/book" \
    --form-string "$AID=" --form-string "startsAt=2030-01-01T03:00:00.000Z" \
    --form-string "name=Crafted" --form-string "email=crafted@$SLUG.test" \
    --form-string "state=Utah")
  check "off-menu time refused" "error=taken" "$R"
else
  echo "  - no open times (no availability rules) — booking race skipped"
fi

echo "== 9. Beacon boundary =="
curl -s -o /dev/null "${CONNECT[@]}" -X POST "$BASE/api/beacon" -H "Content-Type: application/json" \
  -d '{"path":"/","referrer":"https://smoke-referrer.invalid/x"}'
curl -s -o /dev/null "${CONNECT[@]}" -X POST "$BASE/api/beacon" -H "Content-Type: application/json" \
  -d '{"path":"/gradebook","referrer":"https://smoke-referrer.invalid/x"}'
BV=$(node --input-type=module -e '
import { readFileSync } from "node:fs"; import pg from "pg";
const env = readFileSync(".env","utf8");
const c = new pg.Client({connectionString: env.match(/^DIRECT_URL="?([^"\n]+?)"?$/m)[1]});
await c.connect();
const good = await c.query(`SELECT count(*)::int AS n FROM "PageView" WHERE "referrerHost" = $1 AND path = $2`, ["smoke-referrer.invalid", "/"]);
const badp = await c.query(`SELECT count(*)::int AS n FROM "PageView" WHERE path = $1`, ["/gradebook"]);
console.log(JSON.stringify({good: good.rows[0].n, bad: badp.rows[0].n})); await c.end();')
check "allowed path counted" '"good":1' "$BV"
check "app path never enters table" '"bad":0' "$BV"

echo "== 10. Operator console =="
node scripts/create-operator.mjs "smoke-op@schoolcohort.com" "smoke-Op-3344!" >/dev/null 2>&1
L=$(curl -s -c "$JAR/op" "${CONNECT[@]}" "$BASE/cohort-admin/login"); AID=$(aid_of "$L")
R=$(curl -s -b "$JAR/op" -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" -X POST "$BASE/cohort-admin/login" \
  --form-string "$AID=" --form-string "email=smoke-op@schoolcohort.com" --form-string "password=WRONG")
check "wrong password refused uniformly" "error=1" "$R"
R=$(curl -s -b "$JAR/op" -c "$JAR/op" -o /dev/null -w '%{redirect_url}' "${CONNECT[@]}" -X POST "$BASE/cohort-admin/login" \
  --form-string "$AID=" --form-string "email=smoke-op@schoolcohort.com" --form-string "password=smoke-Op-3344!")
check "operator login" "/cohort-admin" "$R"
for p in /cohort-admin /cohort-admin/schools /cohort-admin/leads /cohort-admin/walkthroughs /cohort-admin/email /cohort-admin/marketing /cohort-admin/operators /cohort-admin/settings; do
  status "console $p" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR/op" "${CONNECT[@]}" "$BASE$p")"
done
SCH=$(curl -s -b "$JAR/op" "${CONNECT[@]}" "$BASE/cohort-admin/schools")
check "schools table lists the smoke school" "Smoke Test School" "$SCH"
LEADS=$(curl -s -b "$JAR/op" "${CONNECT[@]}" "$BASE/cohort-admin/leads")
if [ -n "${FIRSTISO:-}" ]; then check "booking became a lead" "Smoke Booker" "$LEADS"; fi
# add a lead through the real action (create panel SSRs with ?new=lead)
NEWL=$(curl -s -b "$JAR/op" "${CONNECT[@]}" "$BASE/cohort-admin/leads?new=lead")
AID=$(aid_of "$NEWL")
curl -s -b "$JAR/op" -o /dev/null "${CONNECT[@]}" -X POST "$BASE/cohort-admin/leads" \
  --form-string "$AID=" --form-string "name=Smoke Lead" --form-string "email=lead@$SLUG.test" \
  --form-string "state=" --form-string "note=smoke"
LEADS=$(curl -s -b "$JAR/op" "${CONNECT[@]}" "$BASE/cohort-admin/leads")
check "addLead works" "Smoke Lead" "$LEADS"

echo "== 11. Cleanup =="
node --input-type=module -e '
import { readFileSync } from "node:fs"; import pg from "pg";
const env = readFileSync(".env","utf8");
const c = new pg.Client({connectionString: env.match(/^DIRECT_URL="?([^"\n]+?)"?$/m)[1]});
await c.connect();
const slug = process.argv[1];
const s = await c.query(`SELECT id FROM "School" WHERE slug=$1`, [slug]);
if (s.rows.length) {
  const sid = s.rows[0].id;
  const u = await c.query(`SELECT id FROM "User" WHERE "schoolId"=$1`, [sid]);
  const ids = u.rows.map(r=>r.id);
  if (ids.length) {
    await c.query(`DELETE FROM "Session" WHERE "userId" = ANY($1)`, [ids]);
    await c.query(`DELETE FROM "Token" WHERE "userId" = ANY($1)`, [ids]);
    await c.query(`DELETE FROM "Audit" WHERE "actorId" = ANY($1)`, [ids]);
  }
  await c.query(`DELETE FROM "User" WHERE "schoolId"=$1`, [sid]);
  await c.query(`DELETE FROM "School" WHERE id=$1`, [sid]);
  console.log("  ✓ smoke school removed");
}
// booking + leads made by this run (emails end in .$slug.test)
const leads = await c.query(`SELECT id FROM "Lead" WHERE email LIKE $1`, ["%@"+slug+".test"]);
for (const r of leads.rows) await c.query(`DELETE FROM "WalkthroughSlot" WHERE "leadId"=$1`, [r.id]);
const dl = await c.query(`DELETE FROM "Lead" WHERE email LIKE $1`, ["%@"+slug+".test"]);
console.log("  ✓ smoke leads/bookings removed:", dl.rowCount);
const op = await c.query(`SELECT id FROM "User" WHERE email=$1 AND "schoolId" IS NULL`, ["smoke-op@schoolcohort.com"]);
if (op.rows.length) {
  await c.query(`DELETE FROM "Session" WHERE "userId"=$1`, [op.rows[0].id]);
  await c.query(`DELETE FROM "User" WHERE id=$1`, [op.rows[0].id]);
  console.log("  ✓ smoke operator removed");
}
const pv = await c.query(`DELETE FROM "PageView" WHERE "referrerHost"=$1`, ["smoke-referrer.invalid"]);
console.log("  ✓ smoke beacon rows removed:", pv.rowCount);
await c.end();' "$SLUG"

echo ""
echo "=========================================="
echo " SMOKE: $PASS passed, $FAIL failed"
echo "=========================================="
[ "$FAIL" -eq 0 ]
