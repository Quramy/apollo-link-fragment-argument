import { ApolloLink, Operation, NextLink } from "apollo-link";
import { transform } from "./transform";

export class ArgumentFragmentLink extends ApolloLink {
  request(operation: Operation, forward?: NextLink) {
    if (!forward) {
      throw new Error("ArgumentFragmentLink needs one or more apollo-links to delegate");
    }
    operation.query = transform(operation.query);
    return forward(operation);
  }
}

export function createFragmentArgumentLink() {
  return new ArgumentFragmentLink();
}
