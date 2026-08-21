import SpecGroupDetail from "@/components/qreview/SpecGroupDetail";

export const metadata = { title: "Chi tiết nhóm thông số" };

const AdminSpecGroupPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;
  return <SpecGroupDetail groupId={id} />;
};

export default AdminSpecGroupPage;
