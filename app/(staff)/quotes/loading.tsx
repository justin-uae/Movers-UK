import { SkeletonPageHead, SkeletonKpiRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <SkeletonKpiRow count={4} />
      <SkeletonTable withSearch cols={6} />
    </div>
  );
}
