import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import type { E2EFixtures } from "./global-setup";

export function fixtures(): E2EFixtures {
  return JSON.parse(readFileSync("tests/e2e/.auth/fixtures.json", "utf8"));
}

export async function signIn(page: Page, email: string, password: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /account menu/ })).toBeVisible();
}

export async function guess(page: Page, amount: string) {
  await page.getByLabel(/Your guess/).fill(amount);
  await page.getByRole("button", { name: /Lock in guess/ }).click();
}
