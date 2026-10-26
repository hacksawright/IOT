import PageHeader from '../components/PageHeader';

// Trang tạm cho các mục sidebar chưa làm
export default function Placeholder({ title, subtitle }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card placeholder">Trang này đang được phát triển.</div>
    </>
  );
}
