import { SkeletonPageHead, SkeletonCardList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <SkeletonCardList count={5} />
    </div>
  );
}
