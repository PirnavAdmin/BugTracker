import ImportUsers from "@/components/settings/ImportUsers";
import SettingsPanel from "@/components/settings/SettingsPanel";

const ImportUsersCSVSettings = (props) => (
  <SettingsPanel
    title="Import Users from CSV"
    description="Upload a CSV with either Full Name or name, and Email Address or email. Imported users get the default password Curecode@123 and the default role Developer."
  >
    <ImportUsers {...props} embedded />
  </SettingsPanel>
);

export default ImportUsersCSVSettings;
