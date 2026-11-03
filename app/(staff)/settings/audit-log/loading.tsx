import { SkeletonPageHead, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <SkeletonTable cols={4} rows={10} />
    </div>
  );
}
