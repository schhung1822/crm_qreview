"use client";

import {
  Bold,
  Captions,
  Download,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Underline,
  Undo2,
  Unlink,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  getPostImageSources,
  isRichPostContent,
  sanitizePostContent,
} from "@/lib/qreview/post-content";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onFeedback: (message: string, type?: "success" | "error") => void;
};

type ToolbarButtonProps = {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
};

function ToolbarButton({
  label,
  onClick,
  children,
  disabled = false,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs transition hover:bg-[var(--p-color-bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderColor: "var(--admin-border)", color: "var(--admin-muted)" }}
    >
      {children}
    </button>
  );
}

function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function legacyToHtml(content: string) {
  if (!content.trim()) return "";
  if (isRichPostContent(content)) return content;

  return content
    .split(/\n\s*\n/)
    .map((block) => {
      const text = block.trim();
      if (text.startsWith("### ")) return `<h3>${escapeText(text.slice(4))}</h3>`;
      if (text.startsWith("## ")) return `<h2>${escapeText(text.slice(3))}</h2>`;
      return `<p>${escapeText(text).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

export default function RichTextEditor({
  value,
  onChange,
  onFeedback,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;

    const nextHtml = legacyToHtml(value);
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
  }, [value]);

  const stats = useMemo(() => {
    if (typeof document === "undefined") {
      return { words: 0, headings: 0, images: 0, missingAlt: 0, externalImages: 0 };
    }

    const documentCopy = document.implementation.createHTMLDocument("");
    documentCopy.body.innerHTML = value;
    const words = (documentCopy.body.textContent ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const images = Array.from(documentCopy.querySelectorAll("img"));

    return {
      words,
      headings: documentCopy.querySelectorAll("h2, h3, h4").length,
      images: images.length,
      missingAlt: images.filter((image) => !image.getAttribute("alt")?.trim()).length,
      externalImages: getPostImageSources(value).filter((source) => /^https?:\/\//i.test(source)).length,
    };
  }, [value]);

  const rememberSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (!savedRangeRef.current) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRangeRef.current);
  };

  const emitChange = () => {
    const html = editorRef.current?.innerHTML ?? "";
    onChange(html === "<br>" ? "" : html);
    rememberSelection();
  };

  const runCommand = (command: string, commandValue?: string) => {
    restoreSelection();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const insertHtml = (html: string) => {
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    emitChange();
  };

  const insertLink = () => {
    const url = window.prompt("Nhập đường dẫn liên kết (https://...):");
    if (!url) return;
    runCommand("createLink", url.trim());
  };

  const insertImageByUrl = () => {
    const url = window.prompt("Nhập đường dẫn ảnh (https://...):");
    if (!url) return;
    const alt = window.prompt("Mô tả ảnh (alt) cho SEO:")?.trim() ?? "";
    const caption = window.prompt("Chú thích ảnh:")?.trim() ?? "";
    const safeUrl = url.trim().replace(/"/g, "&quot;");
    insertHtml(
      `<figure><img src="${safeUrl}" alt="${escapeText(alt)}">${
        caption ? `<figcaption>${escapeText(caption)}</figcaption>` : ""
      }</figure><p><br></p>`
    );
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("files", file);
      const response = await fetch("/api/qreview/uploads", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as
        | { urls?: string[]; error?: string }
        | null;
      if (!response.ok || !data?.urls?.[0]) {
        throw new Error(data?.error || `Không tải được ảnh (HTTP ${response.status}).`);
      }

      const alt = window.prompt("Mô tả ảnh (alt) cho SEO:")?.trim() ?? "";
      const caption = window.prompt("Chú thích ảnh:")?.trim() ?? "";
      insertHtml(
        `<figure><img src="${data.urls[0]}" alt="${escapeText(alt)}">${
          caption ? `<figcaption>${escapeText(caption)}</figcaption>` : ""
        }</figure><p><br></p>`
      );
      onFeedback("Đã tải ảnh và chèn vào bài viết.", "success");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Không tải được ảnh.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const importExternalImages = async () => {
    if (!stats.externalImages || isImporting) return;
    setIsImporting(true);

    try {
      const response = await fetch("/api/qreview/posts/import-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editorRef.current?.innerHTML ?? value }),
      });
      const data = await response.json();
      if (!response.ok || typeof data?.content !== "string") {
        throw new Error(data?.error || "Không thể lưu ảnh ngoài về server.");
      }

      if (editorRef.current) editorRef.current.innerHTML = data.content;
      onChange(data.content);
      onFeedback(
        `Đã lưu ${Number(data.imported ?? 0)} ảnh về server QReview.${
          data.failed ? ` ${data.failed} ảnh không tải được và được giữ nguyên link.` : ""
        }`,
        data.failed ? "error" : "success"
      );
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "Không thể lưu ảnh ngoài về server.",
        "error"
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const plainText = event.clipboardData.getData("text/plain");

    if (html) {
      const safeHtml = sanitizePostContent(html) ?? "";
      document.execCommand("insertHTML", false, safeHtml);
    } else {
      const paragraphs = plainText
        .split(/\n\s*\n/)
        .map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("");
      document.execCommand("insertHTML", false, paragraphs);
    }

    emitChange();
  };

  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-[var(--p-color-bg-surface-hover)] p-2" style={{ borderColor: "var(--admin-border)" }}>
        <ToolbarButton label="Hoàn tác" onClick={() => runCommand("undo")}><Undo2 size={15} /></ToolbarButton>
        <ToolbarButton label="Làm lại" onClick={() => runCommand("redo")}><Redo2 size={15} /></ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[var(--admin-border)]" />
        <ToolbarButton label="Đoạn văn" onClick={() => runCommand("formatBlock", "p")}><Pilcrow size={15} /></ToolbarButton>
        <ToolbarButton label="Tiêu đề H2" onClick={() => runCommand("formatBlock", "h2")}><Heading2 size={15} /></ToolbarButton>
        <ToolbarButton label="Tiêu đề H3" onClick={() => runCommand("formatBlock", "h3")}><Heading3 size={15} /></ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[var(--admin-border)]" />
        <ToolbarButton label="In đậm" onClick={() => runCommand("bold")}><Bold size={15} /></ToolbarButton>
        <ToolbarButton label="In nghiêng" onClick={() => runCommand("italic")}><Italic size={15} /></ToolbarButton>
        <ToolbarButton label="Gạch chân" onClick={() => runCommand("underline")}><Underline size={15} /></ToolbarButton>
        <ToolbarButton label="Trích dẫn" onClick={() => runCommand("formatBlock", "blockquote")}><Quote size={15} /></ToolbarButton>
        <ToolbarButton label="Danh sách" onClick={() => runCommand("insertUnorderedList")}><List size={15} /></ToolbarButton>
        <ToolbarButton label="Danh sách đánh số" onClick={() => runCommand("insertOrderedList")}><ListOrdered size={15} /></ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[var(--admin-border)]" />
        <ToolbarButton label="Chèn liên kết" onClick={insertLink}><LinkIcon size={15} /></ToolbarButton>
        <ToolbarButton label="Gỡ liên kết" onClick={() => runCommand("unlink")}><Unlink size={15} /></ToolbarButton>
        <ToolbarButton label="Chèn ảnh từ URL" onClick={insertImageByUrl}><ImagePlus size={15} /></ToolbarButton>
        <ToolbarButton label="Tải ảnh lên" onClick={() => uploadRef.current?.click()} disabled={isUploading}>
          <Upload size={15} />
        </ToolbarButton>
        <ToolbarButton label="Lưu ảnh ngoài về server" onClick={importExternalImages} disabled={!stats.externalImages || isImporting}>
          <Download size={15} />
        </ToolbarButton>
        <input
          ref={uploadRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onPaste={handlePaste}
        data-placeholder="Viết nội dung hoặc dán bài viết từ trang khác vào đây..."
        className="admin-rich-editor min-h-[520px] bg-white px-5 py-5 text-[15px] leading-7 text-[var(--admin-text)] outline-none"
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-[var(--p-color-bg-surface-hover)] px-3 py-2 text-[11px]" style={{ borderColor: "var(--admin-border)", color: "var(--admin-faint)" }}>
        <span>{stats.words.toLocaleString("vi-VN")} từ</span>
        <span>{stats.headings} tiêu đề phụ</span>
        <span>{stats.images} ảnh</span>
        {stats.missingAlt > 0 && <span className="text-amber-600">{stats.missingAlt} ảnh thiếu alt</span>}
        {stats.externalImages > 0 && (
          <span className="inline-flex items-center gap-1 text-blue">
            <Captions size={12} /> {stats.externalImages} ảnh dùng link ngoài
          </span>
        )}
      </div>
    </div>
  );
}
