import { useNavigate } from 'react-router-dom';
import { useDesign } from '../state/DesignStore';
import { stepPath } from './steps';

export function useStepNav(currentStep: number) {
  const navigate = useNavigate();
  const { design, reachStep } = useDesign();
  const goto = (n: number) => {
    reachStep(n);
    navigate(stepPath(design.id, n));
    window.scrollTo({ top: 0 });
  };
  return { goto, next: () => goto(currentStep + 1), back: () => goto(currentStep - 1) };
}
