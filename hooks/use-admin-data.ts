"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type LotteryItem = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  tickets: number;
  location: string | null;
  image_url: string | null;
  rank: number;
  is_active: boolean;
};

type UseAdminLotteryItemsResult = {
  items: LotteryItem[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Loads lottery items (newest first) for admin tooling.
 * Exposes a `reload` callback so callers can refresh after mutations.
 */
export function useAdminLotteryItems(): UseAdminLotteryItemsResult {
  const [items, setItems] = useState<LotteryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from("lottery_items")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      setItems((data ?? []) as LotteryItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lottery items.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  return { items, isLoading, error, reload: loadItems };
}