import {
  transform,
  ArgumentDefinitionValidationError,
  ArgumentValueReplacementError,
  InvalidVariableReferenceError,
  NoCorrespondingFragmentDefinitionError,
} from "./transform";
import { parse, print } from "graphql/language";

function transoformFromString(query: string) {
  return print(transform(parse(query)));
}

describe(transform, () => {
  it("should pass input document when no @arguments directives", () => {
    const query = `
      fragment Hoge on Query {
        hello
      }
      query MyQuery {
        ...Hoge
      }
    `;
    expect(transoformFromString(query)).toMatchSnapshot();
  });

  it("should transform to replace arguments", () => {
    const query = `
      fragment Hoge on Query @argumentDefinitions(
        bar: { type: "String" }
      ) {
        hello(bar: $bar)
      }
      query MyQuery($foo: String!) {
        ...Hoge @arguments(bar: $foo)
      }
    `;
    expect(transoformFromString(query)).toMatchSnapshot();
  });

  it("should transform to replace arguments with defaultValue", () => {
    const query = `
      fragment Hoge on Query @argumentDefinitions(
        bar: { type: "String", defaultValue: "BAR" }
      ) {
        hello(bar: $bar)
      }
      query MyQuery {
        ...Hoge
      }
    `;
    expect(transoformFromString(query)).toMatchSnapshot();
  });

  it("should transform with nesetd fragments", () => {
    const query = `
      fragment Fuga on Product @argumentDefinitions(
        ycount: { type: "Int", defaultValue: 3 }
      ) {
        relatedProducts(count: $ycount) {
          name
        }
      }

      fragment Hoge on Query @argumentDefinitions(
        pcount: { type: "Int", defaultValue: 10 }
      ) {
        products(count: $pcount) {
          name
          price
          ...Fuga @arguments(ycount: $pcount)
        }
      }

      query MyQuery($count: Int!) {
        ...Hoge @arguments(pcount: $count)
      }
    `;
    expect(transoformFromString(query)).toMatchSnapshot();
  });

  it("should transform Relay example", () => {
    const query = `
      fragment TodoList_list on TodoList @argumentDefinitions(
        count: {type: "Int", defaultValue: 10},  # Optional argument
        userID: {type: "ID"},                    # Required argument
      ) {
        title
        todoItems(userID: $userID, first: $count) {  # Use fragment arguments here as variables
          ...TodoItem_item
        }
      }
      query TodoListQuery($count: Int, $userID: ID) {
        ...TodoList_list @arguments(count: $count, userID: $userID) # Pass arguments here
      }
    `;
    expect(transoformFromString(query)).toMatchSnapshot();
  });

  it(`should throw ${ArgumentDefinitionValidationError.name} with invalid @argumentDefinitions`, () => {
    expect(() => transoformFromString(`fragment Hoge on Foo @argumentDefinitions { id }`)).toThrow(
      ArgumentDefinitionValidationError,
    );
    expect(() => transoformFromString(`fragment Hoge on Foo @argumentDefinitions(a: 1) { id }`)).toThrow(
      ArgumentDefinitionValidationError,
    );
    expect(() => transoformFromString(`fragment Hoge on Foo @argumentDefinitions(a: { hoge: "hoge" }) { id }`)).toThrow(
      ArgumentDefinitionValidationError,
    );
    expect(() => transoformFromString(`fragment Hoge on Foo @argumentDefinitions(a: { type: 100 }) { id }`)).toThrow(
      ArgumentDefinitionValidationError,
    );
  });

  it(`should throw ${ArgumentValueReplacementError.name} with invalid argument references`, () => {
    const query = `
      fragment Hoge on Query @argumentDefinitions(
        bar: { type: "String" }
      ) {
        hello(bar: $bar)
      }
      query MyQuery {
        ...Hoge
      }
    `;
    expect(() => transoformFromString(query)).toThrow(ArgumentValueReplacementError);
  });

  it(`should throw ${NoCorrespondingFragmentDefinitionError.name} with invalid fragment redferences`, () => {
    const query = `

      fragment Fuga on Something @argumentDefinitions(
        foo: { type: "String" }
      ) {
        bar(foo: $foo)
      }

      query MyQuery($hoge: String!) {
        ...Fugaaaa @arguments(foo: $hoge)
      }
    `;
    expect(() => transoformFromString(query)).toThrow(NoCorrespondingFragmentDefinitionError);
  });

  it(`should throw ${InvalidVariableReferenceError.name} with invalid variable references`, () => {
    const query = `
      fragment Hoge on Something @argumentDefinitions(
        bar: { type: "String" }
      ) {
        fuga(bar: $bar)
      }

      fragment Fuga on Something @argumentDefinitions(
        foo: { type: "String" }
      ) {
        ...Hoge @arguments(bar: $foooo)
      }

      query MyQuery($hoge: String!) {
        ...Fuga @arguments(foo: $hoge)
      }
    `;
    expect(() => transoformFromString(query)).toThrow(InvalidVariableReferenceError);
  });
});
