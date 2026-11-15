// The design system on one page: every token and base component, so the designer
// subagent and the visual baseline (e2e/styleguide.spec.ts) see a change to any of them.
// Colors, radius and fonts are set in app/globals.css; rules in docs/design-system.md.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const colors = [
  ["background", "bg-background", "text-foreground"],
  ["primary", "bg-primary", "text-primary-foreground"],
  ["secondary", "bg-secondary", "text-secondary-foreground"],
  ["muted", "bg-muted", "text-muted-foreground"],
  ["accent", "bg-accent", "text-accent-foreground"],
  ["card", "bg-card", "text-card-foreground"],
  ["destructive", "bg-destructive", "text-primary-foreground"],
];

// The named text styles (app/ui-base.css), each shown in its own size.
const typeScale = [
  ["Large title", "font-heading text-large-title"],
  ["Title 1", "font-heading text-title-1"],
  ["Title 2", "text-title-2"],
  ["Title 3", "text-title-3"],
  ["Headline", "text-headline"],
  ["Body", "text-body"],
  ["Callout", "text-callout"],
  ["Subheadline", "text-subheadline"],
  ["Footnote", "text-footnote"],
  ["Caption", "text-caption"],
  ["Caption 2", "text-caption-2"],
];

export default function Styleguide() {
  return (
    <div className="flex max-w-4xl flex-col gap-12">
      <h1 className="text-large-title">Styleguide</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2">Colors</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {colors.map(([name, bg, fg]) => (
            <div key={name} className={`${bg} ${fg} rounded-lg border p-4 text-subheadline font-medium`}>
              {name}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title-2">Type</h2>
        <p className="text-subheadline text-muted-foreground">Lora (font-heading) for page and book titles; Inter for everything else.</p>
        {typeScale.map(([name, cls]) => (
          <p key={name} className={cls}>
            {name}
          </p>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2">Form and card</h2>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Cards group related content.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="styleguide-email">Email</Label>
            <Input id="styleguide-email" placeholder="you@example.com" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
