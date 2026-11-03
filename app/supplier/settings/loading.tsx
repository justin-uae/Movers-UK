import { SkeletonPageHead, SkeletonCardGrid } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <SkeletonCardGrid count={2} />
    </div>
  );
}
