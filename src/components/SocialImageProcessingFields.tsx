'use client';

import { BlockStack, Checkbox, RangeSlider, Text, TextField } from '@shopify/polaris';

interface Props {
  enabled: boolean;
  cropSquare: boolean;
  scale: number;
  barHeight: number;
  showLogo: boolean;
  logoUrl: string;
  onEnabledChange: (value: boolean) => void;
  onCropSquareChange: (value: boolean) => void;
  onScaleChange: (value: number) => void;
  onBarHeightChange: (value: number) => void;
  onShowLogoChange: (value: boolean) => void;
  onLogoUrlChange: (value: string) => void;
}

export function SocialImageProcessingFields({
  enabled,
  cropSquare,
  scale,
  barHeight,
  showLogo,
  logoUrl,
  onEnabledChange,
  onCropSquareChange,
  onScaleChange,
  onBarHeightChange,
  onShowLogoChange,
  onLogoUrlChange,
}: Props) {
  return (
    <BlockStack gap="300">
      <Checkbox
        label="Bật xử lý ảnh: tải về, tùy chỉnh kích thước, thêm khung trắng và logo"
        checked={enabled}
        onChange={onEnabledChange}
      />
      {enabled ? (
        <>
          <Checkbox
            label="Cắt ảnh thành hình vuông (tỷ lệ 1:1)"
            helpText="Mặc định bật. Tắt tùy chọn này để giữ nguyên tỷ lệ ảnh gốc."
            checked={cropSquare}
            onChange={onCropSquareChange}
          />
          <RangeSlider
            label={`Scale ảnh: ${scale.toFixed(2)}x`}
            min={1}
            max={1.5}
            step={0.05}
            value={scale}
            onChange={(value) => onScaleChange(Number(value))}
            output
          />
          <RangeSlider
            label={`Độ dày khung trắng: ${Math.min(barHeight, 80)}px`}
            min={0}
            max={80}
            step={10}
            value={Math.min(barHeight, 80)}
            onChange={(value) => onBarHeightChange(Number(value))}
            output
          />
          <TextField
            label="Logo riêng (tùy chọn)"
            value={logoUrl}
            onChange={onLogoUrlChange}
            autoComplete="off"
            placeholder="Để trống để dùng logo mặc định"
            helpText="Có thể dùng URL http(s), data URI hoặc đường dẫn nội bộ /images/..."
          />
          <Checkbox
            label="Chèn logo vào góc ảnh"
            checked={showLogo}
            onChange={onShowLogoChange}
          />
        </>
      ) : (
        <Text as="p" tone="subdued">
          Hệ thống sẽ gửi nguyên các URL ảnh đã dán lên nền tảng. URL phải là HTTPS công
          khai và đúng yêu cầu tỷ lệ/dung lượng của từng mạng xã hội.
        </Text>
      )}
    </BlockStack>
  );
}
