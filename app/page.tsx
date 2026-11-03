import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { landingHrefForProfile } from "@/lib/landing";

export default async function RootPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  redirect(await landingHrefForProfile(profile));
}
