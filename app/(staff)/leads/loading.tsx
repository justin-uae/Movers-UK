import { SkeletonPageHead, SkeletonKpiRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead withAction />
      <SkeletonKpiRow count={4} />
      <SkeletonTable withTabs withSearch cols={7} />
    </div>
  );
}
