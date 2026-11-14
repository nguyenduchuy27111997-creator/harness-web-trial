import type { Page } from "@playwright/test";

// A valid 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);

export function coverFile(mimeType: string, bytes?: number, name = "cover.png") {
  const buffer = bytes === undefined ? PNG : Buffer.concat([PNG, Buffer.alloc(Math.max(0, bytes - PNG.length))]);
  return { name, mimeType, buffer };
}

// Chooses a file in the book page's cover form and submits it with the button named `button`.
export async function submitCover(page: Page, file: ReturnType<typeof coverFile>, button: string) {
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByRole("button", { name: button, exact: true }).click();
}
