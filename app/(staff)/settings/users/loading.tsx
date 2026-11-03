import { SkeletonPageHead, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead withAction />
      <SkeletonTable withSearch cols={7} />
    </div>
  );
}
