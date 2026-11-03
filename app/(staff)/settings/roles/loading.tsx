import { SkeletonPageHead, SkeletonCardList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead withAction />
      <SkeletonCardList count={6} />
    </div>
  );
}
