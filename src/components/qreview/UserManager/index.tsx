"use client";

import React, { useCallback, useEffect, useState } from "react";

import {
  EmptyState,
  FeedbackBox,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDateTime,
  type Feedback,
} from "../ui";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  role: "admin" | "user";
  status: string;
  isEnvAdmin: boolean;
  activeSessions: number;
  createdAt: string | null;
  lastLoginAt: string | null;
};

const UserManager = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadUsers = useCallback(async (query: string) => {
    setIsLoading(true);

    try {
      const url = query.trim()
        ? `/api/qreview/users?q=${encodeURIComponent(query.trim())}`
        : "/api/qreview/users";

      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: data?.error ?? "Không thể tải danh sách người dùng.",
        });
        setUsers([]);
        return;
      }

      setUsers(data.users ?? []);
      setCurrentUserId(data.currentUserId ?? null);
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers("");
  }, [loadUsers]);

  const patchUser = async (
    id: string,
    payload: { role?: string; status?: string },
    confirmText: string
  ) => {
    if (pendingId) {
      return;
    }

    if (!window.confirm(confirmText)) {
      return;
    }

    setPendingId(id);
    setFeedback(null);

    try {
      const response = await fetch("/api/qreview/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: data?.error ?? "Không thể cập nhật người dùng.",
        });
        return;
      }

      setUsers((prev) =>
        prev.map((user) => (user.id === id ? { ...user, ...data.user } : user))
      );
      setFeedback({ type: "success", text: "Đã cập nhật người dùng." });
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Phân quyền quản trị và khoá tài khoản vi phạm. Khoá tài khoản sẽ đăng xuất người đó khỏi mọi thiết bị ngay lập tức."
      />

      <FeedbackBox feedback={feedback} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void loadUsers(search);
        }}
        className="admin-card mb-4 flex flex-wrap gap-3 p-4"
      >
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo email, tên hoặc tên hiển thị"
          className="admin-input min-w-[260px] flex-1"
        />
        <button type="submit" className="admin-btn-primary">
          Tìm kiếm
        </button>
      </form>

      {isLoading ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <EmptyState message="Chưa có người dùng nào." />
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Quyền</th>
                <th>Trạng thái</th>
                <th>Đăng nhập cuối</th>
                <th>Phiên</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isBusy = pendingId === user.id;
                const isBlocked = user.status === "blocked";

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="font-medium">
                        {user.name ?? "(chưa đặt tên)"}
                        {isSelf && (
                          <span className="ml-2 text-xs admin-muted">(bạn)</span>
                        )}
                      </div>
                      <div className="text-sm admin-muted">{user.email}</div>
                      <div className="text-xs admin-muted">
                        Tạo: {formatDateTime(user.createdAt)}
                      </div>
                    </td>

                    <td>
                      <span
                        className={
                          user.role === "admin"
                            ? "admin-badge-info"
                            : "admin-badge-neutral"
                        }
                      >
                        {user.role === "admin" ? "Quản trị viên" : "Thành viên"}
                      </span>
                      {user.isEnvAdmin && (
                        <div className="mt-1 text-xs admin-muted">từ ADMIN_EMAILS</div>
                      )}
                    </td>

                    <td>
                      <StatusBadge status={isBlocked ? "blocked" : "active"} />
                    </td>

                    <td className="whitespace-nowrap text-xs admin-muted">
                      {formatDateTime(user.lastLoginAt)}
                    </td>

                    <td>{user.activeSessions}</td>

                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isBusy || isSelf || user.isEnvAdmin}
                          onClick={() =>
                            patchUser(
                              user.id,
                              { role: user.role === "admin" ? "user" : "admin" },
                              user.role === "admin"
                                ? `Gỡ quyền quản trị của ${user.email}?`
                                : `Cấp quyền quản trị cho ${user.email}?`
                            )
                          }
                          className="admin-action"
                        >
                          {user.role === "admin" ? "Gỡ quyền admin" : "Cấp quyền admin"}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy || isSelf || user.isEnvAdmin}
                          onClick={() =>
                            patchUser(
                              user.id,
                              { status: isBlocked ? "active" : "blocked" },
                              isBlocked
                                ? `Mở khoá tài khoản ${user.email}?`
                                : `Khoá tài khoản ${user.email}? Người này sẽ bị đăng xuất khỏi mọi thiết bị.`
                            )
                          }
                          className={
                            isBlocked
                              ? "admin-btn-secondary admin-btn-sm"
                              : "admin-btn-danger admin-btn-sm"
                          }
                        >
                          {isBlocked ? "Mở khoá" : "Khoá"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default UserManager;
