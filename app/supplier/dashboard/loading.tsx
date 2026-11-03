import { SkeletonPageHead, SkeletonKpiRow, SkeletonCardList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <SkeletonKpiRow count={4} />
      <SkeletonCardList count={5} />
    </div>
  );
}
