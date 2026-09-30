import { useEffect, type ComponentType } from 'react';
import { Button, EmptyState, Spinner, Text } from '@capra/core';
import { CheckOutlined } from '@capra/icons';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { DEPLOYMENT_MODEL_OPTIONS } from '../model/catalog';
import { useStore } from '../state/DesignStore';
import { Stepper } from '../ui/layout';
import { stepBySlug, stepPath } from '../ui/steps';
import Step1Mode from './steps/Step1Mode';
import Step2Sources from './steps/Step2Sources';
import Step3Drivers from './steps/Step3Drivers';
import Step4Features from './steps/Step4Features';
import Step5Architecture from './steps/Step5Architecture';
import Step6Plan from './steps/Step6Plan';
import Step7Build from './steps/Step7Build';

const STEP_COMPONENTS: Record<number, ComponentType> = {
  1: Step1Mode,
  2: Step2Sources,
  3: Step3Drivers,
  4: Step4Features,
  5: Step5Architecture,
  6: Step6Plan,
  7: Step7Build,
};

export default function WizardRoute() {
  const { designId = '', step } = useParams();
  const navigate = useNavigate();
  const { ready, current, loadingId, openDesign, error, saveState, connected } = useStore();

  useEffect(() => {
    if (ready && designId && current?.id !== designId) void openDesign(designId);
  }, [ready, designId, current?.id, openDesign]);

  if (!ready || loadingId === designId || (current?.id !== designId && !error)) {
    return (
      <div className="center-state">
        <Spinner size="lg" title="Loading design" />
      </div>
    );
  }
  if (!current) {
    return (
      <div className="center-state">
        <EmptyState title="Design not available" description={error ?? 'This design could not be loaded.'} illustration="EmptyFolder" size="lg">
          <Button variant="primary" onClick={() => navigate('/')}>
            Back to designs
          </Button>
        </EmptyState>
      </div>
    );
  }

  const def = stepBySlug(step);
  if (!def) return <Navigate to={stepPath(current.id, Math.min(current.maxStepReached, 5))} replace />;
  if (def.n > current.maxStepReached) return <Navigate to={stepPath(current.id, current.maxStepReached)} replace />;
  const StepComponent = STEP_COMPONENTS[def.n];
  const model = DEPLOYMENT_MODEL_OPTIONS.find((o) => o.value === current.drivers.deploymentModel)?.label;

  return (
    <div className="page">
      <div className="wizard-top">
        <div className="wizard-top__row">
          <div className="wizard-top__title">
            <Text as="span" variant="heading-md">
              {current.name}
            </Text>
            <Text as="span" variant="body-sm-normal" color="secondary">
              {current.customer ? `${current.customer} · ` : ''}
              {current.mode === 'production' ? 'Production' : 'POC'} · {model}
            </Text>
          </div>
          <span className="save-state" aria-live="polite">
            {saveState === 'saving' && <Text variant="body-xs-normal">Saving…</Text>}
            {saveState === 'saved' && (
              <>
                <CheckOutlined size="xs" />
                <Text variant="body-xs-normal">{connected ? 'Saved to Cribl' : 'Saved (local demo mode)'}</Text>
              </>
            )}
            {saveState === 'error' && (
              <Text variant="body-xs-normal" color="warning">
                Not saved — {error}
              </Text>
            )}
          </span>
        </div>
        <Stepper designId={current.id} current={def.n} maxReached={current.maxStepReached} />
      </div>
      <StepComponent key={`${current.id}-${def.n}`} />
    </div>
  );
}
