"use server";

import { saveAppSettings, saveLotteryItem, type AppSettingsInput, type LotteryItemInput } from "@/lib/admin/management";

export async function saveLotteryItemAction(input: LotteryItemInput) {
  return saveLotteryItem(input);
}

export async function saveAppSettingsAction(input: AppSettingsInput) {
  return saveAppSettings(input);
}
