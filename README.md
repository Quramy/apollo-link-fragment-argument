# apollo-link-fragment-argument

![](https://github.com/Quramy/apollo-link-fragment-argument/workflows/test/badge.svg)

An Apollo Link to enable`@argumentDefinitions` and `@arguments` directives inspired from [Relay Modern's Fragment container](https://relay.dev/docs/en/fragment-container.html#passing-arguments-to-a-fragment).

## Usage

### Install

```sh
$ npm i apollo-link-fragment-argument
```

### Configure apollo client

```ts
import { ApolloClient } from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";
import { from } from "apollo-link";
import { createHttpLink } from "apollo-link-http";

import { createFragmentArgumentLink } from "apollo-link-fragment-argument";

function createApolloClient() {
  const cache = new InMemoryCache();
  const link = from([
    createFragmentArgumentLink(),
    createHttpLink({
      uri: "http://your.graphql.endpoint",
    }),
  ]);
  return new ApolloClient({
    cache,
    link,
  });
}
```

### Using `@argumentDefinitions` and `@arguments` directive in your query

```ts
const todoListFragment = gql`
  fragment TodoList_list on TodoList
    @argumentDefinitions(
      count: { type: "Int", defaultValue: 10 } # Optional argument
      userID: { type: "ID" } # Required argument
    ) {
    title
    todoItems(userID: $userID, first: $count) {
      # Use fragment arguments here as variables
      ...TodoItem_item
    }
  }
`;
```

```ts
const query = gql`
  query TodoListQuery($count: Int, $userID: ID) {
    ...TodoList_list @arguments(count: $count, userID: $userID) # Pass arguments here
  }
  ${todoListFragment}
`;
```

## Why?

I'm loving [GraphQL's fragments colocation](https://www.apollographql.com/docs/react/data/fragments/#colocating-fragments).

> combined with GraphQL's support for fragments, allows you to split your queries up in such a way that the various fields fetched by the queries are located right alongside the code that uses the field.

However, GraphQL syntax has no ability to parameterize Fragment (See https://github.com/graphql/graphql-spec/issues/204 if you want detail).

`@argumentDefinitions` and `@arguments` are originally introduced by Relay Modern to compose parametrized Fragments. See https://relay.dev/docs/en/fragment-container.html#composing-fragments ,

## License

MIT
