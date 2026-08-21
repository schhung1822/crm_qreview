"use client";

import { useCallback, useEffect, useState } from "react";

import type { Feedback } from "./index";

/**
 * Hook dung chung cho cac man hinh CRUD trong khu quan tri.
 *
 * Moi endpoint /api/qreview/* deu theo cung mot hop dong: GET tra ve mot mang,
 * POST tao, PATCH sua, DELETE xoa, va loi nam o truong `error`. Gom logic goi
 * mang vao day de tung trang chi con lo phan giao dien.
 */

const GENERIC_ERROR = "Đã có lỗi xảy ra. Vui lòng thử lại.";

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export type MutationResult = { ok: boolean; error?: string };

export function useAdminResource<T>(options: {
  /** Duong dan endpoint, vi du "/api/qreview/brands". */
  endpoint: string;
  /** Ten truong chua mang trong ket qua GET, vi du "brands". */
  collectionKey: string;
  /** Tham so truy van them cho GET. */
  query?: Record<string, string | null | undefined>;
  /** Tu dong nap khi mount (mac dinh true). */
  autoLoad?: boolean;
}) {
  const { endpoint, collectionKey, autoLoad = true } = options;

  // Tham so truy van duoc chuoi hoa de dung lam dependency on dinh — neu truyen
  // thang object, moi lan render se tao object moi va gay vong lap nap lai.
  const querySignature = JSON.stringify(options.query ?? {});

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams();
      const parsedQuery = JSON.parse(querySignature) as Record<string, string | null>;

      for (const [key, value] of Object.entries(parsedQuery)) {
        if (value !== null && value !== undefined && value !== "") {
          params.set(key, String(value));
        }
      }

      const url = params.toString() ? `${endpoint}?${params}` : endpoint;
      const response = await fetch(url, { cache: "no-store" });
      const data = await readJson(response);

      if (!response.ok) {
        setFeedback({ type: "error", text: (data.error as string) ?? GENERIC_ERROR });
        setItems([]);
        return;
      }

      setItems((data[collectionKey] as T[]) ?? []);
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, collectionKey, querySignature]);

  useEffect(() => {
    if (autoLoad) {
      void load();
    }
  }, [autoLoad, load]);

  /** Goi POST/PATCH/DELETE roi nap lai danh sach neu thanh cong. */
  const mutate = useCallback(
    async (
      method: "POST" | "PATCH" | "DELETE",
      payload: unknown,
      successText: string
    ): Promise<MutationResult> => {
      if (isSaving) {
        return { ok: false, error: "Đang xử lý, vui lòng đợi." };
      }

      setIsSaving(true);
      setFeedback(null);

      try {
        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await readJson(response);

        if (!response.ok) {
          const error = (data.error as string) ?? GENERIC_ERROR;
          setFeedback({ type: "error", text: error });
          return { ok: false, error };
        }

        setFeedback({ type: "success", text: successText });
        await load();

        return { ok: true };
      } catch {
        const error = "Không kết nối được tới máy chủ.";
        setFeedback({ type: "error", text: error });
        return { ok: false, error };
      } finally {
        setIsSaving(false);
      }
    },
    [endpoint, isSaving, load]
  );

  const create = useCallback(
    (payload: unknown) => mutate("POST", payload, "Đã thêm thành công."),
    [mutate]
  );

  const update = useCallback(
    (payload: unknown) => mutate("PATCH", payload, "Đã cập nhật thành công."),
    [mutate]
  );

  const remove = useCallback(
    (id: string, confirmText: string) => {
      if (!window.confirm(confirmText)) {
        return Promise.resolve({ ok: false } as MutationResult);
      }

      return mutate("DELETE", { id }, "Đã xoá thành công.");
    },
    [mutate]
  );

  return {
    items,
    isLoading,
    isSaving,
    feedback,
    setFeedback,
    load,
    create,
    update,
    remove,
    mutate,
  };
}
