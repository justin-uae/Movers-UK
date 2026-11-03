import { redirect } from "next/navigation";

// AI Created Quotes used to be its own standalone list — folded back into
// Pending Quotes (an AI-generated quote now just shows there, or in
// whichever Bookings tab it's since moved on to, with an "AI" badge next to
// its status instead of living on a separate page). This route is kept as
// a redirect, not deleted outright, so an old bookmark/link doesn't 404.
export default function Page() {
  redirect("/quotes");
}
