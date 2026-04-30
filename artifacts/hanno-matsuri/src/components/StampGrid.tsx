import { StampSpot } from "@workspace/api-client-react/src/generated/api.schemas";
import { Check, MapPin } from "lucide-react";
import { format } from "date-fns";

interface StampGridProps {
  stamps: StampSpot[];
}

export function StampGrid({ stamps }: StampGridProps) {
  // Pad the grid to have nice rows (e.g., 3 columns, up to 12 slots for 11 spots)
  const paddedStamps = [...stamps];
  while (paddedStamps.length < 12) {
    paddedStamps.push({
      id: -paddedStamps.length,
      name: "",
      description: "",
      location: "",
      order: 999,
      obtained: false,
    });
  }

  return (
    <div className="grid grid-cols-3 gap-3 p-4 bg-card rounded-2xl shadow-inner border border-border">
      {paddedStamps.map((stamp, index) => {
        const isEmptyPlaceholder = stamp.id < 0;
        
        return (
          <div 
            key={stamp.id} 
            className={`aspect-square relative flex flex-col items-center justify-center rounded-full border-2 
              ${isEmptyPlaceholder ? 'border-dashed border-muted/50' : 
                stamp.obtained ? 'border-primary/20 bg-primary/5' : 'border-dashed border-muted bg-muted/20'}
            `}
          >
            {!isEmptyPlaceholder && (
              <>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-xs font-bold text-muted-foreground shadow-sm">
                  {index + 1}
                </div>
                
                {stamp.obtained ? (
                  <div className="flex flex-col items-center justify-center stamp-animation text-primary">
                    <div className="w-12 h-12 rounded-full border-4 border-primary flex items-center justify-center rotate-[-15deg] opacity-90 shadow-[0_0_15px_rgba(220,38,38,0.2)]">
                      <span className="font-serif font-black text-xl">済</span>
                    </div>
                    {stamp.obtainedAt && (
                      <span className="text-[8px] font-mono mt-1 opacity-70 absolute -bottom-2 bg-background px-1 rounded">
                        {format(new Date(stamp.obtainedAt), "MM/dd HH:mm")}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground/50 opacity-50 px-2 text-center">
                    <MapPin className="w-5 h-5 mb-1" />
                    <span className="text-[9px] font-bold leading-tight line-clamp-2">{stamp.name}</span>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
