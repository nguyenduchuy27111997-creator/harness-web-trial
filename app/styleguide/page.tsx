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

export default function Styleguide() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Styleguide</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Colors</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {colors.map(([name, bg, fg]) => (
            <div key={name} className={`${bg} ${fg} rounded-lg border p-4 text-sm font-medium`}>
              {name}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">Type</h2>
        <p className="font-heading text-4xl font-semibold tracking-tight">Heading 1</p>
        <p className="font-heading text-2xl font-semibold">Heading 2</p>
        <p className="font-heading text-lg font-medium">Heading 3</p>
        <p className="text-base">Body text for paragraphs and labels.</p>
        <p className="text-sm text-muted-foreground">Muted text for hints and metadata.</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Buttons</h2>
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
        <h2 className="text-2xl font-semibold">Form and card</h2>
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
    </main>
  );
}
