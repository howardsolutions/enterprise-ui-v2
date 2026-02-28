import React from "react";

type SkeletonVariant = "text" | "card" | "table-row" | "page";

interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
}

function SkeletonLine(): React.ReactElement {
  return <div className="h-4 animate-pulse rounded bg-gray-200" />;
}

function SkeletonCard(): React.ReactElement {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
      <div className="mt-2 h-7 w-24 animate-pulse rounded bg-gray-200" />
    </div>
  );
}

function SkeletonTableRow(): React.ReactElement {
  return (
    <div className="flex gap-4 border-b border-gray-100 px-4 py-3">
      <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
      <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
      <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
      <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
    </div>
  );
}

function SkeletonPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="h-64 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

export function LoadingSkeleton({
  variant = "text",
  count = 1,
}: LoadingSkeletonProps): React.ReactElement {
  const components: Record<SkeletonVariant, React.FC> = {
    text: SkeletonLine,
    card: SkeletonCard,
    "table-row": SkeletonTableRow,
    page: SkeletonPage,
  };

  const Component = components[variant];

  if (count === 1) {
    return <Component />;
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <Component key={index} />
      ))}
    </div>
  );
}
