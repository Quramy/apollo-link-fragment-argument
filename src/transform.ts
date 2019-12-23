import {
  visit,
  DocumentNode,
  FragmentSpreadNode,
  FragmentDefinitionNode,
  DirectiveNode,
  ValueNode,
  VariableNode,
  ArgumentNode,
  StringValueNode,
  ObjectValueNode,
} from "graphql/language";

type ArgDefHolder = {
  fragmentDefinitionNode: FragmentDefinitionNode;
  argumentDefinitionsNode: DirectiveNode;
};

type ArgsHolder = {
  isRoot: boolean;
  fragmentSpreadNode: FragmentSpreadNode;
  argumentsNode: DirectiveNode;
};

type ArgumentDefinitionModel = {
  variableType: string;
  defaultValueNode?: ValueNode;
};

type ArgDefHolderWithModel = ArgDefHolder & {
  variableMap: Map<string, ArgumentDefinitionModel>;
};

export class ArgumentDefinitionValidationError extends Error {}

export class NoCorrespondingFragmentDefinitionError extends Error {}

export class InvalidVariableReferenceError extends Error {}

export class ArgumentValueReplacementError extends Error {}

function createArgumentDefnitionModelMap(argumentDefinitionsNode: DirectiveNode) {
  const modelMap = new Map<string, ArgumentDefinitionModel>();
  if (!argumentDefinitionsNode.arguments || !argumentDefinitionsNode.arguments.length) {
    throw new ArgumentDefinitionValidationError("@argumentDefinitionsNode needs arguments to define.");
  }
  argumentDefinitionsNode.arguments.forEach(argumentNode => {
    const varName = argumentNode.name.value;
    if (argumentNode.value.kind !== "ObjectValue") {
      throw new ArgumentDefinitionValidationError(
        `An argument of @argumentDefinitions should be an object: ${varName}`,
      );
    }
    const value = argumentNode.value as ObjectValueNode;
    const typeField = value.fields.find(f => f.name.value === "type");
    if (!typeField) {
      throw new ArgumentDefinitionValidationError(`${varName} definition has no 'type' field`);
    }
    if (typeField.value.kind !== "StringValue") {
      throw new ArgumentDefinitionValidationError(`'type' field should be a string: ${varName}`);
    }
    const variableType = (typeField.value as StringValueNode).value;
    const defaultValueNode = value.fields.find(f => f.name.value === "defaultValue");
    const model = {
      variableType,
      defaultValueNode: defaultValueNode ? defaultValueNode.value : undefined,
    } as ArgumentDefinitionModel;
    modelMap.set(varName, model);
  });
  return modelMap;
}

function collect(input: DocumentNode) {
  const argDefsHolderSet = new Set<ArgDefHolder>();
  const argsHolderSet = new Set<ArgsHolder>();
  let inRootContext = false;
  visit(input, {
    OperationDefinition: {
      enter() {
        inRootContext = true;
      },
      leave() {
        inRootContext = false;
      },
    },
    FragmentDefinition(node) {
      if (node.directives) {
        const argDefsNode = node.directives.find(directive => directive.name.value === "argumentDefinitions");
        if (!argDefsNode) return;
        argDefsHolderSet.add({
          fragmentDefinitionNode: node,
          argumentDefinitionsNode: argDefsNode,
        });
      }
    },
    FragmentSpread(node) {
      if (node.directives) {
        const argsNode = node.directives.find(directive => directive.name.value === "arguments");
        if (!argsNode) return;
        argsHolderSet.add({
          isRoot: inRootContext,
          fragmentSpreadNode: node,
          argumentsNode: argsNode,
        });
      }
    },
  });
  return {
    argsSet: argsHolderSet,
    argDefsSet: argDefsHolderSet,
  };
}

export function transform(input: DocumentNode): DocumentNode {
  const { argDefsSet, argsSet } = collect(input);

  const defsMap = new Map<string, ArgDefHolderWithModel>();
  for (const defs of argDefsSet) {
    const fragmentName = defs.fragmentDefinitionNode.name.value;
    const variableMap = createArgumentDefnitionModelMap(defs.argumentDefinitionsNode);
    defsMap.set(fragmentName, { ...defs, variableMap });
  }
  const argsMap = new Map<string, ArgsHolder>();
  for (const args of argsSet) {
    const fragmentName = args.fragmentSpreadNode.name.value;
    argsMap.set(fragmentName, args);
  }

  const newFragmenDefinitions = new Map<string, FragmentDefinitionNode>();

  const processCaller = ({ fragmentSpreadNode, argumentsNode }: ArgsHolder, variableScope?: Map<string, ValueNode>) => {
    const variableMap = new Map<string, ValueNode>();
    argumentsNode.arguments!.forEach(argumentNode => {
      if (argumentNode.value.kind === "Variable" && variableScope) {
        // resolve variables from parent scope
        const varNode = argumentNode.value as VariableNode;
        const variableFromScope = variableScope.get(varNode.name.value);
        if (!variableFromScope) {
          throw new InvalidVariableReferenceError(
            `There is variable reference '${varNode.name.value}' but this variable does not exist in this scope`,
          );
        }
        variableMap.set(argumentNode.name.value, variableFromScope);
      } else {
        variableMap.set(argumentNode.name.value, argumentNode.value);
      }
    });

    const callee = defsMap.get(fragmentSpreadNode.name.value);
    if (!callee) {
      throw new NoCorrespondingFragmentDefinitionError(
        `There is no corresponding Fragment decorated with @argumentDefinitions: ${fragmentSpreadNode.name.value}`,
      );
    }
    return processCallee(callee, variableMap);
  };

  const processCallee = (callee: ArgDefHolderWithModel, variableMap = new Map<string, ValueNode>()) => {
    let inSelectionScope = false;
    const newFragmentDef = visit(callee.fragmentDefinitionNode, {
      SelectionSet: {
        enter() {
          inSelectionScope = true;
        },
        leave() {
          inSelectionScope = false;
        },
      },
      Argument(node) {
        if (!inSelectionScope) return;
        if (node.value.kind === "Variable") {
          const varNode = node.value as VariableNode;
          const variableDifinition = callee.variableMap.get(varNode.name.value);
          if (!variableDifinition) return;
          const variable = variableMap.get(varNode.name.value);
          if (variable) {
            return {
              ...node,
              value: variable,
            } as ArgumentNode;
          } else if (variableDifinition.defaultValueNode) {
            return {
              ...node,
              value: variableDifinition.defaultValueNode,
            } as ArgumentNode;
          } else {
            throw new ArgumentValueReplacementError(
              `Argument '${varNode.name.value}' is defined but has no defaultValue.`,
            );
          }
        }
      },
      FragmentSpread(node) {
        const caller = argsMap.get(node.name.value);
        if (caller) {
          processCaller(caller, variableMap);
        }
      },
      Directive: {
        leave(node) {
          if (node.name.value === "arguments" || node.name.value === "argumentDefinitions") {
            return null;
          }
        },
      },
    });

    // TODO handle when target fragment already exists in the map
    newFragmenDefinitions.set(callee.fragmentDefinitionNode.name.value, newFragmentDef);
  };

  [...argsSet.values()].filter(({ isRoot }) => isRoot).forEach(argsHolder => processCaller(argsHolder));
  [...defsMap.entries()]
    .filter(([fragmentName, defs]) => !newFragmenDefinitions.has(fragmentName))
    .forEach(([_, defs]) => processCallee(defs));

  const output = visit(input, {
    FragmentDefinition(node) {
      const nodeToReplace = newFragmenDefinitions.get(node.name.value);
      if (nodeToReplace) return nodeToReplace;
    },
    Directive: {
      leave(node) {
        if (node.name.value === "arguments") {
          return null;
        }
      },
    },
  });

  return output;
}
