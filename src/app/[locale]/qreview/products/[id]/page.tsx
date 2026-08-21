import ProductForm from "@/components/qreview/ProductForm";

export const metadata = { title: "Sửa sản phẩm" };

const AdminProductEditPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;
  return <ProductForm productId={id} />;
};

export default AdminProductEditPage;
