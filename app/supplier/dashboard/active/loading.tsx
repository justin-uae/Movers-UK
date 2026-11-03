import { SkeletonPageHead, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <SkeletonTable withSearch rows={8} cols={5} />
    </div>
  );
}
