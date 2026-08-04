import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// The MVP's "/" route: send each role to its home.
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role === "parent") redirect("/parent");
  if (session.user.role === "student") redirect("/student");
  redirect("/dashboard");
}
