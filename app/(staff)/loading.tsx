import { SkeletonPage } from "@/components/ui/Skeleton";

// Catch-all fallback for every route under (staff) that doesn't ship a more
// specific loading.tsx of its own — shown instantly on navigation while the
// destination page's Server Component still has to hit the database.
export default function Loading() {
  return <SkeletonPage />;
}
