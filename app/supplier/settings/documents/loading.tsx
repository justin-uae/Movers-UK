import { SkeletonPageHead, SkeletonPanelLines } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <SkeletonPageHead />
      <SkeletonPanelLines lines={2} />
    </div>
  );
}
