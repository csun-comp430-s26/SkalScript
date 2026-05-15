import { Parser } from "../parser/Parser"
import { tokenize } from "../lexer/tokenize"
import { TypeChecker } from "../typechecker/TypeChecker"
import { Type } from "../parser/AST"

function check(source: string): Type {
  const program = new Parser(tokenize(source)).parseProgram()
  return new TypeChecker().checkProgram(program)
}

const LIST_ADT = `algdef List<A> { Cons(A, List<A>), Nil() }`

// ============================================================
// Basic expressions
// ============================================================

describe("basic expressions", () => {

  it("types true as Boolean", () => {
    expect(check(`true`)).toEqual({ kind: "BuiltinType", name: "Boolean" })
  })

  it("types false as Boolean", () => {
    expect(check(`false`)).toEqual({ kind: "BuiltinType", name: "Boolean" })
  })

  it("types unit as Unit", () => {
    expect(check(`unit`)).toEqual({ kind: "BuiltinType", name: "Unit" })
  })

  it("types println(exp) as Unit regardless of the argument type", () => {
    expect(check(`println(5)`)).toEqual({ kind: "BuiltinType", name: "Unit" })
  })

  it("types a less-than comparison of integers as Boolean", () => {
    expect(check(`1 < 2`)).toEqual({ kind: "BuiltinType", name: "Boolean" })
  })

  it("types a greater-than comparison of integers as Boolean", () => {
    expect(check(`1 > 2`)).toEqual({ kind: "BuiltinType", name: "Boolean" })
  })

  it("types an integer equality as Boolean", () => {
    expect(check(`1 == 1`)).toEqual({ kind: "BuiltinType", name: "Boolean" })
  })

  it("types a boolean equality as Boolean", () => {
    expect(check(`true == false`)).toEqual({ kind: "BuiltinType", name: "Boolean" })
  })
})

// ============================================================
// Blocks and statements
// ============================================================

describe("blocks and statements", () => {

  it("types a block with a single val binding as the inner expression type", () => {
    expect(check(`{ val x: Int = 1; x }`)).toEqual({
      kind: "BuiltinType",
      name: "Int"
    })
  })

  it("types a block that mutates a var binding before returning it", () => {
    expect(check(`{ var x: Int = 0; x = 2; x }`)).toEqual({
      kind: "BuiltinType",
      name: "Int"
    })
  })

  it("types a block with multiple val bindings used in an arithmetic expression", () => {
    expect(check(`{ val x: Int = 1; val y: Int = 2; x + y }`)).toEqual({
      kind: "BuiltinType",
      name: "Int"
    })
  })

  it("throws a type mismatch when reassigning a var to a value of the wrong type", () => {
    expect(() => check(`{ var x: Int = 0; x = true; x }`)).toThrow(
      "Type mismatch"
    )
  })

  it("throws when assigning to an immutable val binding", () => {
    expect(() => check(`{ val x: Int = 0; x = 1; x }`)).toThrow(
      "Cannot assign to immutable val"
    )
  })

  it("throws when assigning to a variable that has not been declared", () => {
    expect(() => check(`{ y = 1; unit }`)).toThrow("Unknown variable")
  })

  it("throws a type mismatch when a val annotation conflicts with the initializer", () => {
    expect(() => check(`{ val x: Int = true; x }`)).toThrow("Type mismatch")
  })
})

// ============================================================
// Calls and identifiers
// ============================================================

describe("calls and identifiers", () => {

  it("returns the FunctionType of a monomorphic function referenced as a bare value", () => {
    expect(check(`def inc(x: Int): Int = x + 1; inc`)).toEqual({
      kind: "FunctionType",
      paramTypes: [{ kind: "BuiltinType", name: "Int" }],
      returnType: { kind: "BuiltinType", name: "Int" }
    })
  })

  it("returns the FunctionType of a monomorphic zero-arg constructor referenced as a bare value", () => {
    expect(check(`algdef Color { Red() } Red`)).toEqual({
      kind: "FunctionType",
      paramTypes: [],
      returnType: { kind: "AlgebraicType", name: "Color", typeArgs: [] }
    })
  })

  it("throws when a generic function is referenced as a bare value without type arguments", () => {
    expect(() => check(`def id<A>(x: A): A = x; id`)).toThrow(
      "Generic function id cannot be used as a value"
    )
  })

  it("throws when a generic constructor is referenced as a bare value without type arguments", () => {
    expect(() => check(`algdef Box<A> { Box(A) } Box`)).toThrow(
      "Generic constructor Box cannot be used as a value"
    )
  })

  it("throws on a reference to an identifier that is not bound anywhere", () => {
    expect(() => check(`missingName`)).toThrow(
      "Unknown identifier: missingName"
    )
  })

  it("throws when calling a value whose type is not a FunctionType", () => {
    expect(() => check(`{ val x: Int = 5; x(1) }`)).toThrow(
      "Attempted to call non-function"
    )
  })

  it("throws when applying type arguments to a non-polymorphic function value", () => {
    expect(() =>
      check(`{ val f: (Int) => Int = (x: Int) => x; f<Int>(1) }`)
    ).toThrow("Cannot apply type arguments to non-polymorphic function")
  })

  it("throws when a polymorphic call supplies the wrong number of type arguments", () => {
    expect(() => check(`def id<A>(x: A): A = x; id<Int, Int>(1)`)).toThrow(
      "Expected 1 type arguments, got 2"
    )
  })

  it("throws when a call supplies the wrong number of value arguments", () => {
    expect(() => check(`def f(x: Int): Int = x; f(1, 2)`)).toThrow(
      "Expected 1 arguments, got 2"
    )
  })
})

// ============================================================
// Type validation errors
// ============================================================

describe("type validation errors", () => {

  it("throws on a duplicate ADT definition", () => {
    expect(() =>
      check(`algdef Foo { Bar() } algdef Foo { Baz() } unit`)
    ).toThrow("Duplicate ADT: Foo")
  })

  it("throws on a duplicate constructor name across two different ADTs", () => {
    expect(() =>
      check(`algdef Foo { Bar() } algdef Other { Bar() } unit`)
    ).toThrow("Duplicate constructor: Bar")
  })

  it("throws on a duplicate function definition", () => {
    expect(() => check(`def f(): Int = 1; def f(): Int = 2; 0`)).toThrow(
      "Duplicate function: f"
    )
  })

  it("throws when a function name collides with a constructor name", () => {
    expect(() =>
      check(`algdef Foo { Bar() } def Bar(): Int = 1; 0`)
    ).toThrow("Function Bar conflicts with a constructor of the same name")
  })

  it("throws when a function parameter type uses an undeclared type variable", () => {
    expect(() => check(`def f(x: A): Int = 1; 0`)).toThrow(
      "Unknown type variable: A"
    )
  })

  it("throws when a function parameter type names an unknown ADT", () => {
    expect(() => check(`def f(x: Missing<Int>): Int = 1; 0`)).toThrow(
      "Unknown type: Missing"
    )
  })

  it("throws when an ADT type expression is supplied the wrong number of type arguments", () => {
    expect(() =>
      check(`algdef List<A> { Nil() } def f(x: List<Int, Int>): Int = 1; 0`)
    ).toThrow("Wrong number of type arguments for List")
  })

  it("throws when a function declares the same type parameter twice", () => {
    expect(() => check(`def f<A, A>(x: A): A = x; 0`)).toThrow(
      "Duplicate type parameter A in function f"
    )
  })

  it("throws when a function declares two value parameters with the same name", () => {
    expect(() => check(`def f(x: Int, x: Boolean): Boolean = x; 0`)).toThrow(
      "Duplicate parameter name x in function f"
    )
  })

  it("throws when a lambda declares two parameters with the same name", () => {
    expect(() => check(`((x: Int, x: Boolean) => x)(1, true)`)).toThrow(
      "Duplicate parameter name x in lambda"
    )
  })

  it("throws when an ADT constructor parameter references a type variable that is not in scope", () => {
    expect(() => check(`algdef Foo<A> { Bar(B) } unit`)).toThrow(
      "Unknown type variable: B"
    )
  })
})

// ============================================================
// Pattern errors
// ============================================================

describe("pattern errors", () => {

  it("throws when the same variable name appears twice inside one pattern", () => {
    expect(() =>
      check(
        `algdef Pair { Pair(Int, Int) } match Pair(1, 2) { case Pair(x, x) => x }`
      )
    ).toThrow("Duplicate pattern variable: x")
  })

  it("throws when a pattern names a constructor that does not exist", () => {
    expect(() =>
      check(`${LIST_ADT} match Nil<Int>() { case Foo() => 0 case Nil() => 1 }`)
    ).toThrow("Unknown constructor: Foo")
  })

  it("throws when a constructor pattern is given the wrong number of arguments", () => {
    expect(() =>
      check(`${LIST_ADT} match Nil<Int>() { case Cons(h) => 1 case Nil() => 0 }`)
    ).toThrow("Pattern arity mismatch")
  })

  it("throws when a constructor pattern is matched against a non-algebraic subject", () => {
    expect(() =>
      check(`algdef Color { Red() } match 5 { case Red() => 1 }`)
    ).toThrow("Cannot unify")
  })

  it("throws when a constructor pattern belongs to a different ADT than the subject", () => {
    expect(() =>
      check(
        `algdef Color { Red() } algdef Shape { Circle() } match Red() { case Circle() => 1 }`
      )
    ).toThrow("Cannot unify")
  })
})

// ============================================================
// Match exaustivity
// ============================================================

describe("match exhaustivity", () => {

  it("accepts a match that covers every top-level constructor", () => {
    const source = `
      ${LIST_ADT}
      match Nil<Int>() {
        case Cons(h, t) => 1
        case Nil() => 0
      }
    `
    expect(check(source)).toEqual({ kind: "BuiltinType", name: "Int" })
  })

  it("rejects a match missing a top-level constructor and reports Nil() as the missing case", () => {
    const source = `
      ${LIST_ADT}
      match Nil<Int>() {
        case Cons(h, t) => 1
      }
    `
    expect(() => check(source)).toThrow(
      "Non-exhaustive match: no case covers Nil()"
    )
  })

  it("reports Cons(_, Cons(_, _)) when Cons's tail is only matched against Nil()", () => {
    const source = `
      ${LIST_ADT}
      match Nil<Int>() {
        case Cons(h, Nil()) => 1
        case Nil() => 0
      }
    `
    expect(() => check(source)).toThrow(
      "Non-exhaustive match: no case covers Cons(_, Cons(_, _))"
    )
  })

  it("accepts a leading wildcard case followed by an unreachable constructor case (redundant-case detection is out of scope)", () => {
    const source = `
      ${LIST_ADT}
      match Nil<Int>() {
        case _ => 0
        case Cons(h, t) => 1
      }
    `
    expect(check(source)).toEqual({ kind: "BuiltinType", name: "Int" })
  })

  it("treats a trailing wildcard case as covering every remaining shape", () => {
    const source = `
      ${LIST_ADT}
      match Nil<Int>() {
        case Cons(h, t) => 1
        case _ => 0
      }
    `
    expect(check(source)).toEqual({ kind: "BuiltinType", name: "Int" })
  })

  it("treats a single variable case as covering every value of the subject type", () => {
    const source = `
      ${LIST_ADT}
      match Nil<Int>() {
        case x => 0
      }
    `
    expect(check(source)).toEqual({ kind: "BuiltinType", name: "Int" })
  })

  it("accepts a match on Int with a variable catch-all, the only valid way to be exhaustive over Int since constructor patterns on Int are rejected before exhaustivity runs", () => {
    expect(check(`match 5 { case x => x }`)).toEqual({
      kind: "BuiltinType",
      name: "Int"
    })
  })

  it("accepts deeply nested cases where Cons's tail is covered by both Nil() and Cons(a, b)", () => {
    const source = `
      ${LIST_ADT}
      def f<A>(list: List<A>): Int =
        match list {
          case Cons(h, Nil()) => 1
          case Cons(h, Cons(a, b)) => 2
          case Nil() => 0
        };
      f<Int>(Nil<Int>())
    `
    expect(check(source)).toEqual({ kind: "BuiltinType", name: "Int" })
  })

  it("rejects a nested gap inside a generic function where the element type is a type variable but the tail's List structure is still tracked", () => {
    const source = `
      ${LIST_ADT}
      def f<A>(list: List<A>): Int =
        match list {
          case Cons(h, Cons(a, b)) => 2
          case Nil() => 0
        };
      f<Int>(Nil<Int>())
    `
    expect(() => check(source)).toThrow(
      "Non-exhaustive match: no case covers Cons(_, Nil())"
    )
  })

  it("specializes a variable row while checking a complete constructor signature (Nil, x, and Cons all present)", () => {
    const source = `
      ${LIST_ADT}
      match Nil<Int>() {
        case Nil() => 0
        case x => 1
        case Cons(h, t) => 2
      }
    `
    expect(check(source)).toEqual({ kind: "BuiltinType", name: "Int" })
  })

  it("type-checks the spec's generic List program with map and length to List<Int>", () => {
    const source = `
      algdef List<A> {
        Cons(A, List<A>),
        Nil()
      }
      def map<A, B>(list: List<A>, f: (A) => B): List<B> =
        match list {
          case Cons(head, tail) =>
            Cons<B>(f(head), map<A, B>(tail, f))
          case Nil() => Nil<B>()
        };
      def length<A>(list: List<A>): Int =
        match list {
          case Cons(_, tail) => 1 + length<A>(tail)
          case Nil() => 0
        };
      map<Int, Int>(Cons<Int>(1, Nil<Int>()), (x: Int) => x + 1)
    `
    expect(check(source)).toEqual({
      kind: "AlgebraicType",
      name: "List",
      typeArgs: [{ kind: "BuiltinType", name: "Int" }]
    })
  })
})
