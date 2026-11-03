import { SkeletonPageHead, SkeletonCardGrid } from "@/components/ui/Skeleton";

// Fallback for the settings overview page, and for any settings/* subroute
// that doesn't ship its own more specific loading.tsx.
export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <SkeletonCardGrid count={4} />
    </div>
  );
}
