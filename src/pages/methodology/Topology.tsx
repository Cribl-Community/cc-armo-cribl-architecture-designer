import type { ReactNode } from 'react';
import { Text } from '@capra/core';
import { PORTS, nodeProfile } from '../../model/catalog';
import { ProductLogo } from '../../ui/logos';

const EXAMPLE = nodeProfile('medium', 'x86');

function Box({ title, sub, tone = 'default', children }: { title: string; sub?: string; tone?: 'default' | 'brand' | 'edge'; children?: ReactNode }) {
  return (
    <div className={`topo-box topo-box--${tone}`}>
      <div className="topo-box__head">
        <Text variant="body-sm-semibold">{title}</Text>
        {sub && (
          <Text variant="body-xs-normal" color="secondary">
            {sub}
          </Text>
        )}
      </div>
      {children && <div className="topo-box__body">{children}</div>}
    </div>
  );
}

const Pills = ({ label, n }: { label: string; n: number }) => (
  <div className="topo-pills" aria-label={`${n} ${label}`}>
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className="topo-pill">
        {label}
      </span>
    ))}
  </div>
);

/** Static diagram of Cribl's control/data plane hierarchy. */
export function Topology() {
  return (
    <div className="topo" role="img" aria-label="Leader manages Worker Groups made of Worker Nodes running Worker Processes, and Edge Fleets and Subfleets made of Edge Nodes">
      <div className="topo-leader">
        <Box title="Leader" sub={`Control plane · UI/API ${PORTS.UI_API}`} tone="brand" />
      </div>
      <div className="topo-links" aria-hidden>
        <span>{`Worker Nodes → Leader ${PORTS.WORKER_TO_LEADER}`}</span>
        <span>{`Edge Nodes → Leader ${PORTS.WORKER_TO_LEADER}`}</span>
      </div>
      <div className="topo-planes">
        <div className="topo-plane">
          <div className="topo-plane__label">
            <ProductLogo product="stream" size="sm" />
            <Text variant="body-xs-semibold">CRIBL STREAM</Text>
          </div>
          <Box title="Worker Group" sub="One shared config: Sources, Pipelines, Routes, Destinations">
            <div className="topo-row">
              {[0, 1].map((i) => (
                <Box key={i} title="Worker Node" sub={`${EXAMPLE.vcpus} vCPU x86`}>
                  <Pills label="WP" n={EXAMPLE.workerProcesses} />
                  <Text variant="body-xs-normal" color="secondary">
                    {`${EXAMPLE.workerProcesses} Worker Processes (vCPU − ${EXAMPLE.reservedVcpus})`}
                  </Text>
                </Box>
              ))}
              <Box title="Worker Node" sub="≥ 3 per production group" />
            </div>
          </Box>
        </div>
        <div className="topo-plane">
          <div className="topo-plane__label">
            <ProductLogo product="edge" size="sm" />
            <Text variant="body-xs-semibold">CRIBL EDGE</Text>
          </div>
          <Box title="Edge Fleet" sub="e.g. Windows servers" tone="edge">
            <Box title="Subfleet" sub="e.g. by site or role" tone="edge">
              <Pills label="Edge Node" n={3} />
            </Box>
            <Text variant="body-xs-normal" color="secondary">
              {`Sends to Stream over Cribl TCP ${PORTS.CRIBL_TCP}`}
            </Text>
          </Box>
        </div>
      </div>
    </div>
  );
}
