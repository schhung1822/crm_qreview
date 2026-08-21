import PostForm from "@/components/qreview/PostForm";

export const metadata = { title: "Sửa bài viết" };

const AdminPostEditPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;
  return <PostForm postId={id} />;
};

export default AdminPostEditPage;
