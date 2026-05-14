import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  onChange?: (value: number) => void;
  readOnly?: boolean;
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function StarRating({
  value,
  max = 5,
  size = "md",
  onChange,
  readOnly = false,
}: StarRatingProps) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < value;
        const interactive = !readOnly && onChange;
        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange(i + 1)}
            className={cn(
              "transition-transform",
              interactive && "hover:scale-110 cursor-pointer",
              !interactive && "cursor-default",
            )}
            aria-label={`${i + 1} 星`}
          >
            <Star
              className={cn(
                sizeMap[size],
                filled
                  ? "fill-star text-star"
                  : "fill-star-empty text-star-empty",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
