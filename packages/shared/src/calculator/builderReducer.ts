import type { BuilderState, BuilderAction } from '../types/calculator';
import { replaceNode, wrapNode, removeNode } from './astOps';

export const initialBuilderState: BuilderState = {
  ast: null,
  focusedNodeId: null,
  formulaName: '',
  formulaDescription: '',
  isDirty: false,
  editingFormulaId: null,
};

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, formulaName: action.name, isDirty: true };

    case 'SET_DESCRIPTION':
      return { ...state, formulaDescription: action.desc, isDirty: true };

    case 'SET_FOCUS':
      return { ...state, focusedNodeId: action.nodeId };

    case 'SET_ROOT':
      return { ...state, ast: action.node, focusedNodeId: action.node.id, isDirty: true };

    case 'REPLACE_NODE': {
      if (!state.ast) return state;
      const newAST = replaceNode(state.ast, action.nodeId, action.replacement);
      return { ...state, ast: newAST, focusedNodeId: action.replacement.id, isDirty: true };
    }

    case 'WRAP_NODE': {
      if (!state.ast) return state;
      const newAST = wrapNode(state.ast, action.nodeId, action.op, action.side);
      return { ...state, ast: newAST, isDirty: true };
    }

    case 'REMOVE_NODE': {
      if (!state.ast) return state;
      const newAST = removeNode(state.ast, action.nodeId);
      return { ...state, ast: newAST, focusedNodeId: null, isDirty: true };
    }

    case 'SET_OPERATOR': {
      if (!state.ast) return state;
      // Find the binary node and change its operator
      const setOp = (node: typeof state.ast): typeof state.ast => {
        if (!node) return node;
        if (node.id === action.nodeId && node.kind === 'binary') {
          return { ...node, op: action.op };
        }
        if (node.kind === 'binary') {
          return { ...node, left: setOp(node.left)!, right: setOp(node.right)! };
        }
        return node;
      };
      return { ...state, ast: setOp(state.ast)!, isDirty: true };
    }

    case 'LOAD_FORMULA':
      return {
        ast: action.formula.ast,
        focusedNodeId: null,
        formulaName: action.formula.name,
        formulaDescription: action.formula.description ?? '',
        isDirty: false,
        editingFormulaId: action.formula.id,
      };

    case 'RESET':
      return initialBuilderState;

    default:
      return state;
  }
}
