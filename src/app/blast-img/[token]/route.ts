// GET /blast-img/[token] — serve an email-blast image with NO session.
//
// This is the one deliberately public file path. A parent's mail client
// fetches <img> URLs with no cookie and no way to sign in, so access control
// is the token itself: long, random, unique, and set only by the blast image
// upload action. Every other file in the system keeps the authenticated
// /files/[id] route; a FileRec with no publicToken cannot be reached here.

import { prismaSystem } from "@/lib/db";

export const dynamic = "force-dynamic";

// Only ever images, and only formats the upload action accepts. Anything
// else 404s even if a row were somehow mislabelled — this route must never
// become a way to serve arbitrary bytes publicly.
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // System client: the request arrives with no tenant context (any host, no
  // session), and the token is globally unique across schools.
  const f = token ? await prismaSystem.fileRec.findUnique({ where: { publicToken: token } }) : null;
  if (!f || !IMAGE_MIMES.has(f.mime)) return new Response("Not found.", { status: 404 });

  return new Response(new Uint8Array(f.data), {
    status: 200,
    headers: {
      "Content-Type": f.mime,
      // Immutable: an upload is never edited in place — a new image is a new
      // token — so mail clients and proxies may cache as hard as they like.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
