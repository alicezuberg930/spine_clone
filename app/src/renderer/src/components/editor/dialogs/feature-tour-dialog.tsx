import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { LucideIcon } from 'lucide-react'
import { Check, Compass, Sparkles } from 'lucide-react'
import { useMemo } from 'react'

export interface FeatureInfo {
  id: string
  title: string
  description: string
  category: string
  icon?: LucideIcon
  badge?: string
}

export interface FeatureTourDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  features: FeatureInfo[]
}

export function FeatureTourDialog({
  open,
  onOpenChange,
  features
}: FeatureTourDialogProps): React.JSX.Element {
  const categories = useMemo(
    () => Array.from(new Set(features.map((feature) => feature.category))),
    [features]
  )
  const defaultTab = categories[0] ?? 'features'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] flex-col gap-0 overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-3xl">
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-transparent to-transparent px-6 py-5">
          <DialogHeader className="gap-2 text-left">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Compass className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">Trial feature tour</DialogTitle>
                <DialogDescription className="mt-1">
                  Explore the editor systems available in this interactive prototype.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {features.length > 0 ? (
          <Tabs key={defaultTab} defaultValue={defaultTab} className="min-h-0 flex-1 gap-0">
            <div className="border-b border-border/70 px-6 py-2">
              <TabsList variant="line" className="h-8 max-w-full justify-start overflow-x-auto">
                {categories.map((category) => (
                  <TabsTrigger key={category} value={category} className="text-xs">
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {categories.map((category) => (
              <TabsContent key={category} value={category} className="min-h-0 overflow-hidden">
                <ScrollArea className="h-[430px] max-h-[52vh]">
                  <div className="grid gap-3 p-6 sm:grid-cols-2">
                    {features
                      .filter((feature) => feature.category === category)
                      .map((feature) => {
                        const Icon = feature.icon ?? Sparkles
                        return (
                          <article
                            key={feature.id}
                            className="group rounded-xl border border-border/70 bg-muted/20 p-4 transition-colors hover:border-primary/35 hover:bg-primary/5"
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="grid size-9 place-items-center rounded-lg border border-border/80 bg-background/60 text-primary transition-transform group-hover:-translate-y-0.5">
                                <Icon className="size-4" />
                              </div>
                              {feature.badge ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-muted-foreground"
                                >
                                  {feature.badge}
                                </Badge>
                              ) : (
                                <Check className="mt-1 size-4 text-primary" />
                              )}
                            </div>
                            <h3 className="text-sm font-semibold">{feature.title}</h3>
                            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                              {feature.description}
                            </p>
                          </article>
                        )
                      })}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="grid min-h-64 place-items-center px-6 py-12 text-center">
            <div>
              <Sparkles className="mx-auto mb-3 size-7 text-muted-foreground" />
              <p className="text-sm font-medium">No features to show yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add feature records to populate the tour.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
          <Button onClick={() => onOpenChange(false)}>Start exploring</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
