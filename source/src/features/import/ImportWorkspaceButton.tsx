import { useState } from 'react';
import { Button } from '@capra/core';
import { Download } from '@capra/icons';
import { useDesign } from '../../state/DesignStore';
import ImportModal from './ImportModal';

/** Opens the "Import from this workspace" flow. Must be rendered under an open design (uses useDesign()). */
export default function ImportWorkspaceButton() {
  const { design } = useDesign();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" leadingIcon={Download} onClick={() => setOpen(true)}>
        {design.importSnapshot ? 'Re-import from workspace' : 'Import from workspace'}
      </Button>
      {/* Mounted only while open: every open starts a fresh discovery, and unmounting aborts in-flight requests. */}
      {open && <ImportModal onClose={() => setOpen(false)} />}
    </>
  );
}
