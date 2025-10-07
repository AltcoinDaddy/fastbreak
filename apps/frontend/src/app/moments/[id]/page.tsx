import MomentDetails from '../../../components/pages/MomentDetails';
import DashboardLayout from '../../../components/layouts/DashboardLayout';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function MomentDetailsPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <DashboardLayout>
      <MomentDetails momentId={id} />
    </DashboardLayout>
  );
}