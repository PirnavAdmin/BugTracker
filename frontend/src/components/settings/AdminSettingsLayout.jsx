import SettingsSidebar from "@/components/settings/SettingsSidebar";

const AdminSettingsLayout = ({
  activeItem,
  children,
  items,
  onActiveItemChange,
}) => (
  <div className="grid gap-3 lg:grid-cols-[276px_minmax(0,1fr)] lg:items-stretch">
    <SettingsSidebar
      activeItem={activeItem}
      items={items}
      onItemChange={onActiveItemChange}
    />
    <main className="min-w-0 rounded-[20px] border border-slate-200/80 bg-white/90 p-1 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.28)] sm:p-2">{children}</main>
  </div>
);

export default AdminSettingsLayout;
