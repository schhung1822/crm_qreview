"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";

import {
  Checkbox,
  Field,
  FeedbackBox,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  type Feedback,
} from "../ui";

/**
 * Trang chi tiet mot NHOM THONG SO: xem va them/bot cac thong so trong nhom.
 *
 * Tach thanh trang rieng (thay vi panel ben canh danh sach) de duong dan phan
 * anh dung cho ta dang dung — chia se link, bam Back, mo tab moi deu hoat dong.
 */

type SpecGroup = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: string;
  definitionCount: number;
  productCount: number;
};

type SpecDefinition = {
  id: string;
  groupId: string;
  specKey: string;
  label: string;
  section: string | null;
  unit: string | null;
  dataType: string;
  options: string[];
  placeholder: string | null;
  sortOrder: number;
  isRequired: boolean;
  isComparable: boolean;
  isFilterable: boolean;
  isHighlight: boolean;
  status: string;
};

const DATA_TYPE_LABELS: Record<string, string> = {
  text: "Văn bản",
  number: "Số",
  boolean: "Có / Không",
  enum: "Danh sách chọn",
};

const EMPTY_DEFINITION = {
  id: "",
  specKey: "",
  label: "",
  section: "",
  unit: "",
  dataType: "text",
  optionsText: "",
  placeholder: "",
  sortOrder: "0",
  isRequired: false,
  isComparable: true,
  isFilterable: false,
  isHighlight: false,
  status: "active",
};

const EMPTY_GROUP_FORM = {
  name: "",
  slug: "",
  description: "",
  sortOrder: "0",
  status: "active",
};

const GENERIC_ERROR = "Đã có lỗi xảy ra. Vui lòng thử lại.";

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

const SpecGroupDetail = ({ groupId }: { groupId: string }) => {
  const router = useRouter();

  const [group, setGroup] = useState<SpecGroup | null>(null);
  const [definitions, setDefinitions] = useState<SpecDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [notFound, setNotFound] = useState(false);

  const [definitionForm, setDefinitionForm] = useState(EMPTY_DEFINITION);
  const [isDefinitionModalOpen, setIsDefinitionModalOpen] = useState(false);

  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/qreview/spec-groups/${groupId}`, {
        cache: "no-store",
      });
      const data = await readJson(response);

      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      if (!response.ok) {
        setFeedback({ type: "error", text: (data.error as string) ?? GENERIC_ERROR });
        return;
      }

      setGroup(data.group as SpecGroup);
      setDefinitions((data.definitions as SpecDefinition[]) ?? []);
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (
    endpoint: string,
    method: "POST" | "PATCH" | "DELETE",
    payload: unknown,
    successText: string
  ) => {
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
        setFeedback({ type: "error", text: (data.error as string) ?? GENERIC_ERROR });
        return false;
      }

      setFeedback({ type: "success", text: successText });
      return true;
    } catch {
      setFeedback({ type: "error", text: "Không kết nối được tới máy chủ." });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // --- Thông số ------------------------------------------------------------

  const openCreateDefinition = () => {
    setDefinitionForm(EMPTY_DEFINITION);
    setIsDefinitionModalOpen(true);
  };

  const openEditDefinition = (definition: SpecDefinition) => {
    setDefinitionForm({
      id: definition.id,
      specKey: definition.specKey,
      label: definition.label,
      section: definition.section ?? "",
      unit: definition.unit ?? "",
      dataType: definition.dataType,
      optionsText: definition.options.join("\n"),
      placeholder: definition.placeholder ?? "",
      sortOrder: String(definition.sortOrder),
      isRequired: definition.isRequired,
      isComparable: definition.isComparable,
      isFilterable: definition.isFilterable,
      isHighlight: definition.isHighlight,
      status: definition.status,
    });
    setIsDefinitionModalOpen(true);
  };

  const submitDefinition = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      ...definitionForm,
      groupId,
      sortOrder: Number(definitionForm.sortOrder) || 0,
      options: definitionForm.optionsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };

    const ok = await send(
      "/api/qreview/spec-definitions",
      definitionForm.id ? "PATCH" : "POST",
      payload,
      definitionForm.id ? "Đã cập nhật thông số." : "Đã thêm thông số vào nhóm."
    );

    if (ok) {
      setIsDefinitionModalOpen(false);
      await load();
    }
  };

  const deleteDefinition = async (definition: SpecDefinition) => {
    const confirmed = window.confirm(
      `Xoá thông số "${definition.label}" khỏi nhóm? Giá trị đã nhập ở các sản phẩm vẫn được giữ nguyên.`
    );

    if (!confirmed) return;

    if (await send("/api/qreview/spec-definitions", "DELETE", { id: definition.id }, "Đã xoá thông số.")) {
      await load();
    }
  };

  /** Đổi chỗ hai thông số liền kề — thứ tự này là thứ tự ô trong form sản phẩm. */
  const moveDefinition = async (index: number, direction: -1 | 1) => {
    const current = definitions[index];
    const target = definitions[index + direction];

    if (!current || !target || isSaving) return;

    setIsSaving(true);
    setFeedback(null);

    const payloadFor = (item: SpecDefinition, sortOrder: number) => ({
      id: item.id,
      groupId,
      specKey: item.specKey,
      label: item.label,
      section: item.section ?? "",
      unit: item.unit ?? "",
      dataType: item.dataType,
      options: item.options,
      placeholder: item.placeholder ?? "",
      sortOrder,
      isRequired: item.isRequired,
      isComparable: item.isComparable,
      isFilterable: item.isFilterable,
      isHighlight: item.isHighlight,
      status: item.status,
    });

    try {
      await Promise.all([
        fetch("/api/qreview/spec-definitions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadFor(current, target.sortOrder)),
        }),
        fetch("/api/qreview/spec-definitions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadFor(target, current.sortOrder)),
        }),
      ]);

      await load();
    } catch {
      setFeedback({ type: "error", text: "Không đổi được thứ tự." });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Nhóm ----------------------------------------------------------------

  const openEditGroup = () => {
    if (!group) return;

    setGroupForm({
      name: group.name,
      slug: group.slug,
      description: group.description ?? "",
      sortOrder: String(group.sortOrder),
      status: group.status,
    });
    setIsGroupModalOpen(true);
  };

  const submitGroup = async (event: React.FormEvent) => {
    event.preventDefault();

    const ok = await send(
      "/api/qreview/spec-groups",
      "PATCH",
      { id: groupId, ...groupForm, sortOrder: Number(groupForm.sortOrder) || 0 },
      "Đã cập nhật nhóm."
    );

    if (ok) {
      setIsGroupModalOpen(false);
      await load();
    }
  };

  const deleteGroup = async () => {
    if (!group) return;

    const confirmed = window.confirm(
      `Xoá nhóm "${group.name}"? Nhóm phải không còn thông số và không sản phẩm nào đang dùng.`
    );

    if (!confirmed) return;

    if (await send("/api/qreview/spec-groups", "DELETE", { id: groupId }, "Đã xoá nhóm.")) {
      router.push("/qreview/specs");
      router.refresh();
    }
  };

  // --- Giao diện -----------------------------------------------------------

  if (isLoading) {
    return (
      <>
        <PageHeader title="Nhóm thông số" />
        <LoadingState />
      </>
    );
  }

  if (notFound || !group) {
    return (
      <>
        <PageHeader title="Không tìm thấy nhóm" />
        <div className="admin-card px-6 py-16 text-center">
          <p className="text-[13px] admin-muted">
            Nhóm thông số này không tồn tại hoặc đã bị xoá.
          </p>
          <Link href="/qreview/specs" className="admin-btn-secondary mt-4">
            <ArrowLeft size={15} /> Về danh sách nhóm
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={group.name}
        description={
          group.description ??
          "Các thông số bên dưới sẽ hiện thành ô nhập khi sản phẩm chọn nhóm này."
        }
        actions={
          <>
            <Link href="/qreview/specs" className="admin-btn-secondary">
              <ArrowLeft size={15} /> Danh sách nhóm
            </Link>
            <button type="button" onClick={openEditGroup} className="admin-btn-secondary">
              <Pencil size={14} /> Sửa nhóm
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={deleteGroup}
              className="admin-btn-danger"
            >
              <Trash2 size={14} /> Xoá nhóm
            </button>
            <button type="button" onClick={openCreateDefinition} className="admin-btn-primary">
              <Plus size={15} /> Thêm thông số
            </button>
          </>
        }
      />

      <FeedbackBox feedback={feedback} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={group.status} />
        <span className="admin-badge-info">{definitions.length} thông số</span>
        <span className="admin-badge-neutral">{group.productCount} sản phẩm đang dùng</span>
      </div>

      {definitions.length === 0 ? (
        <div className="admin-card px-6 py-16 text-center">
          <p className="mx-auto max-w-md text-[13px] admin-muted">
            Nhóm này chưa có thông số nào. Thêm các trường kỹ thuật mà loại sản phẩm này
            cần — ví dụ &quot;Dung lượng pin&quot;, &quot;Kích thước màn hình&quot;.
          </p>
          <button
            type="button"
            onClick={openCreateDefinition}
            className="admin-btn-primary mt-4"
          >
            <Plus size={15} /> Thêm thông số đầu tiên
          </button>
        </div>
      ) : (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Thứ tự</th>
                <th>Thông số</th>
                <th>Kiểu</th>
                <th>Tính chất</th>
                <th style={{ width: 110 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((definition, index) => (
                <tr key={definition.id}>
                  <td>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        aria-label="Lên trên"
                        disabled={index === 0 || isSaving}
                        onClick={() => moveDefinition(index, -1)}
                        className="admin-action-muted"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Xuống dưới"
                        disabled={index === definitions.length - 1 || isSaving}
                        onClick={() => moveDefinition(index, 1)}
                        className="admin-action-muted"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  </td>

                  <td>
                    <div className="font-medium">
                      {definition.label}
                      {definition.unit ? (
                        <span className="admin-muted"> ({definition.unit})</span>
                      ) : null}
                    </div>
                    <div className="text-xs admin-muted">
                      {definition.specKey}
                      {definition.section ? ` · ${definition.section}` : ""}
                    </div>
                  </td>

                  <td className="text-[13px]">
                    {DATA_TYPE_LABELS[definition.dataType] ?? definition.dataType}
                    {definition.dataType === "enum" && definition.options.length > 0 && (
                      <div className="text-xs admin-muted">
                        {definition.options.slice(0, 3).join(", ")}
                        {definition.options.length > 3 ? "…" : ""}
                      </div>
                    )}
                  </td>

                  <td>
                    <div className="flex flex-wrap gap-1">
                      {definition.isRequired && (
                        <span className="admin-badge-danger">Bắt buộc</span>
                      )}
                      {definition.isComparable && (
                        <span className="admin-badge-info">So sánh</span>
                      )}
                      {definition.isHighlight && (
                        <span className="admin-badge-warning">Nổi bật</span>
                      )}
                      {definition.status !== "active" && (
                        <StatusBadge status={definition.status} />
                      )}
                    </div>
                  </td>

                  <td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditDefinition(definition)}
                        className="admin-action"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => deleteDefinition(definition)}
                        className="admin-action-danger"
                      >
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Hộp thoại thông số --- */}
      <Modal
        open={isDefinitionModalOpen}
        title={
          definitionForm.id ? "Sửa thông số" : `Thêm thông số vào "${group.name}"`
        }
        onClose={() => setIsDefinitionModalOpen(false)}
        wide
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsDefinitionModalOpen(false)}
              className="admin-btn-secondary"
            >
              Huỷ
            </button>
            <button
              type="submit"
              form="definition-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        <form
          id="definition-form"
          onSubmit={submitDefinition}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="Tên hiển thị" htmlFor="def-label" required>
            <input
              id="def-label"
              value={definitionForm.label}
              onChange={(event) =>
                setDefinitionForm((prev) => ({ ...prev, label: event.target.value }))
              }
              required
              autoFocus
              className="admin-input"
              placeholder="Dung lượng pin"
            />
          </Field>

          <Field
            label="Phần"
            htmlFor="def-section"
            hint="Tuỳ chọn. Gom các ô trong form, ví dụ: Màn hình, Pin & sạc."
          >
            <input
              id="def-section"
              value={definitionForm.section}
              onChange={(event) =>
                setDefinitionForm((prev) => ({ ...prev, section: event.target.value }))
              }
              className="admin-input"
              placeholder="Pin & sạc"
            />
          </Field>

          <Field label="Kiểu dữ liệu" htmlFor="def-type">
            <select
              id="def-type"
              value={definitionForm.dataType}
              onChange={(event) =>
                setDefinitionForm((prev) => ({ ...prev, dataType: event.target.value }))
              }
              className="admin-select"
            >
              {Object.entries(DATA_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Đơn vị" htmlFor="def-unit" hint="Ví dụ: mAh, inch, GB">
            <input
              id="def-unit"
              value={definitionForm.unit}
              onChange={(event) =>
                setDefinitionForm((prev) => ({ ...prev, unit: event.target.value }))
              }
              className="admin-input"
              placeholder="mAh"
            />
          </Field>

          {definitionForm.dataType === "enum" && (
            <Field
              label="Các giá trị chọn"
              htmlFor="def-options"
              hint="Mỗi dòng một giá trị."
              required
              className="sm:col-span-2"
            >
              <textarea
                id="def-options"
                value={definitionForm.optionsText}
                onChange={(event) =>
                  setDefinitionForm((prev) => ({ ...prev, optionsText: event.target.value }))
                }
                className="admin-textarea"
                placeholder={"AMOLED\nIPS LCD\nOLED"}
              />
            </Field>
          )}

          <Field label="Gợi ý nhập" htmlFor="def-placeholder">
            <input
              id="def-placeholder"
              value={definitionForm.placeholder}
              onChange={(event) =>
                setDefinitionForm((prev) => ({ ...prev, placeholder: event.target.value }))
              }
              className="admin-input"
              placeholder="Ví dụ: 5000"
            />
          </Field>

          <Field
            label="Mã thông số"
            htmlFor="def-key"
            hint="Để trống sẽ tự sinh. Hai sản phẩm chỉ so sánh được khi dùng chung mã."
          >
            <input
              id="def-key"
              value={definitionForm.specKey}
              onChange={(event) =>
                setDefinitionForm((prev) => ({ ...prev, specKey: event.target.value }))
              }
              className="admin-input"
              placeholder="dung-luong-pin"
            />
          </Field>

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <Checkbox
              label="Bắt buộc nhập"
              checked={definitionForm.isRequired}
              onChange={(value) =>
                setDefinitionForm((prev) => ({ ...prev, isRequired: value }))
              }
              hint="Form nhập sản phẩm sẽ yêu cầu điền ô này."
            />
            <Checkbox
              label="Dùng để so sánh"
              checked={definitionForm.isComparable}
              onChange={(value) =>
                setDefinitionForm((prev) => ({ ...prev, isComparable: value }))
              }
              hint="Xuất hiện trong bảng so sánh sản phẩm."
            />
            <Checkbox
              label="Thông số nổi bật"
              checked={definitionForm.isHighlight}
              onChange={(value) =>
                setDefinitionForm((prev) => ({ ...prev, isHighlight: value }))
              }
              hint="Hiển thị ngay phần tóm tắt sản phẩm."
            />
            <Checkbox
              label="Dùng để lọc"
              checked={definitionForm.isFilterable}
              onChange={(value) =>
                setDefinitionForm((prev) => ({ ...prev, isFilterable: value }))
              }
              hint="Dành cho bộ lọc ở trang danh mục."
            />
          </div>

          <Field label="Trạng thái" htmlFor="def-status">
            <select
              id="def-status"
              value={definitionForm.status}
              onChange={(event) =>
                setDefinitionForm((prev) => ({ ...prev, status: event.target.value }))
              }
              className="admin-select"
            >
              <option value="active">Đang dùng</option>
              <option value="inactive">Ngừng dùng</option>
            </select>
          </Field>
        </form>
      </Modal>

      {/* --- Hộp thoại sửa nhóm --- */}
      <Modal
        open={isGroupModalOpen}
        title="Sửa nhóm thông số"
        onClose={() => setIsGroupModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsGroupModalOpen(false)}
              className="admin-btn-secondary"
            >
              Huỷ
            </button>
            <button
              type="submit"
              form="group-edit-form"
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        <form id="group-edit-form" onSubmit={submitGroup} className="grid gap-4">
          <Field label="Tên nhóm" htmlFor="grp-edit-name" required>
            <input
              id="grp-edit-name"
              value={groupForm.name}
              onChange={(event) =>
                setGroupForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              className="admin-input"
            />
          </Field>

          <Field label="Mô tả" htmlFor="grp-edit-desc">
            <textarea
              id="grp-edit-desc"
              value={groupForm.description}
              onChange={(event) =>
                setGroupForm((prev) => ({ ...prev, description: event.target.value }))
              }
              className="admin-textarea min-h-[70px]"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Slug" htmlFor="grp-edit-slug">
              <input
                id="grp-edit-slug"
                value={groupForm.slug}
                onChange={(event) =>
                  setGroupForm((prev) => ({ ...prev, slug: event.target.value }))
                }
                className="admin-input"
              />
            </Field>

            <Field label="Thứ tự" htmlFor="grp-edit-sort">
              <input
                id="grp-edit-sort"
                type="number"
                value={groupForm.sortOrder}
                onChange={(event) =>
                  setGroupForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                }
                className="admin-input"
              />
            </Field>

            <Field label="Trạng thái" htmlFor="grp-edit-status">
              <select
                id="grp-edit-status"
                value={groupForm.status}
                onChange={(event) =>
                  setGroupForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="admin-select"
              >
                <option value="active">Đang dùng</option>
                <option value="inactive">Ngừng dùng</option>
              </select>
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default SpecGroupDetail;
