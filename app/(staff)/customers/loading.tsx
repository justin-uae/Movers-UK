import { SkeletonPageHead, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead withAction />
      <SkeletonTable cols={5} />
    </div>
  );
}
