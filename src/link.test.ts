import { ApolloClient } from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";
import { from } from "apollo-link";
import { SchemaLink } from "apollo-link-schema";
import { createFragmentArgumentLink } from "./link";
import gql from "graphql-tag";
import { makeExecutableSchema, addMockFunctionsToSchema } from "graphql-tools";

function createClient() {
  const typeDefs = `
    type Product {
      id: ID!
    }
    type Query {
      products(count: Int!): [Product!]
    }
  `;
  const mocks = {
    Query: () => ({
      products(_root: any, variables: { count: number }) {
        return [...new Array(variables.count).keys()].map(i => {
          return {
            __typename: "Product",
            id: `product${i}`,
          };
        });
      },
    }),
  };
  const schema = makeExecutableSchema({ typeDefs });
  addMockFunctionsToSchema({
    schema,
    mocks,
  });
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: from([createFragmentArgumentLink(), new SchemaLink({ schema })]),
  });
  return client;
}
describe("ApolloLinkFragmentArgument", () => {
  it("should work as Apollo Link", async () => {
    const client = createClient();
    const { data } = await client.query({
      variables: {
        productCount: 2,
      },
      query: gql`
        fragment ProductsFragment on Query @argumentDefinitions(count: { type: "Int" }) {
          products(count: $count) {
            id
          }
        }
        query MyQuery($productCount: Int!) {
          ...ProductsFragment @arguments(count: $productCount)
        }
      `,
    });
    expect(data).toBeTruthy();
  });
  it("should work as Apollo Link with default value", async () => {
    const client = createClient();
    const { data } = await client.query({
      query: gql`
        fragment ProductsFragmentWithDefaultValue on Query
          @argumentDefinitions(count: { type: "Int", defaultValue: 10 }) {
          products(count: $count) {
            id
          }
        }
        query MyQuery {
          ...ProductsFragmentWithDefaultValue
        }
      `,
    });
    expect(data).toBeTruthy();
  });
});
