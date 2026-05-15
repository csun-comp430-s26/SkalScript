import { Parser } from "../parser/Parser"
import { tokenize } from "../lexer/tokenize"

// ============================================================
// parseType
// ============================================================

describe("parseType", () => {
    it("parses Int", () => {
        expect(new Parser(tokenize("Int")).parseType()).toEqual({
            kind: "BuiltinType", name: "Int"
        })
    })

    it("parses Boolean", () => {
        expect(new Parser(tokenize("Boolean")).parseType()).toEqual({
            kind: "BuiltinType", name: "Boolean"
        })
    })

    it("parses Unit type", () => {
        expect(new Parser(tokenize("Unit")).parseType()).toEqual({
            kind: "BuiltinType", name: "Unit"
        })
    })

    it("parses a type variable", () => {
        expect(new Parser(tokenize("a")).parseType()).toEqual({
            kind: "TypeVariable", name: "a"
        })
    })

    it("parses an algebraic type with one type argument", () => {
        expect(new Parser(tokenize("Option<Int>")).parseType()).toEqual({
            kind: "AlgebraicType",
            name: "Option",
            typeArgs: [{ kind: "BuiltinType", name: "Int" }]
        })
    })

    it("parses an algebraic type with multiple type arguments", () => {
        expect(new Parser(tokenize("Pair<Int, Boolean>")).parseType()).toEqual({
            kind: "AlgebraicType",
            name: "Pair",
            typeArgs: [
                { kind: "BuiltinType", name: "Int" },
                { kind: "BuiltinType", name: "Boolean" }
            ]
        })
    })

    it("parses a zero-parameter function type", () => {
        expect(new Parser(tokenize("() => Int")).parseType()).toEqual({
            kind: "FunctionType",
            paramTypes: [],
            returnType: { kind: "BuiltinType", name: "Int" }
        })
    })

    it("parses a one-parameter function type", () => {
        expect(new Parser(tokenize("(Int) => Boolean")).parseType()).toEqual({
            kind: "FunctionType",
            paramTypes: [{ kind: "BuiltinType", name: "Int" }],
            returnType: { kind: "BuiltinType", name: "Boolean" }
        })
    })

    it("parses a multi-parameter function type", () => {
        expect(new Parser(tokenize("(Int, Boolean) => Unit")).parseType()).toEqual({
            kind: "FunctionType",
            paramTypes: [
                { kind: "BuiltinType", name: "Int" },
                { kind: "BuiltinType", name: "Boolean" }
            ],
            returnType: { kind: "BuiltinType", name: "Unit" }
        })
    })

    it("throws on unexpected token as type", () => {
        expect(() => new Parser(tokenize("42")).parseType()).toThrow()
    })

    it("parses a parenthesized type", () => {
        expect(new Parser(tokenize("(Int)")).parseType()).toEqual({
            kind: "BuiltinType", name: "Int"
        })
    })

    it("throws on multiple parenthesized types without '=>'", () => {
        expect(() => new Parser(tokenize("(Int, Boolean)")).parseType()).toThrow()
    })
})

// ============================================================
// parseMultiplicative
// ============================================================

describe("parseMultiplicative", () => {
    it("parses left-associative division", () => {
        expect(new Parser(tokenize("8 / 2 / 2")).parseExpression()).toEqual({
            kind: "BinaryExpression",
            operator: "/",
            left: {
                kind: "BinaryExpression",
                operator: "/",
                left: { kind: "IntegerLiteral", value: 8 },
                right: { kind: "IntegerLiteral", value: 2 }
            },
            right: { kind: "IntegerLiteral", value: 2 }
        })
    })
})

// ============================================================
// parseCall
// ============================================================

describe("parseCall", () => {
    it("parses a zero-argument call", () => {
        expect(new Parser(tokenize("f()")).parseExpression()).toEqual({
            kind: "CallExpression",
            callee: { kind: "Identifier", name: "f" },
            typeArgs: [],
            args: []
        })
    })

    it("parses a call with one argument", () => {
        expect(new Parser(tokenize("f(42)")).parseExpression()).toEqual({
            kind: "CallExpression",
            callee: { kind: "Identifier", name: "f" },
            typeArgs: [],
            args: [{ kind: "IntegerLiteral", value: 42 }]
        })
    })

    it("parses a call with multiple arguments", () => {
        expect(new Parser(tokenize("f(1, 2, 3)")).parseExpression()).toEqual({
            kind: "CallExpression",
            callee: { kind: "Identifier", name: "f" },
            typeArgs: [],
            args: [
                { kind: "IntegerLiteral", value: 1 },
                { kind: "IntegerLiteral", value: 2 },
                { kind: "IntegerLiteral", value: 3 }
            ]
        })
    })

    it("parses a type-instantiated call", () => {
        expect(new Parser(tokenize("f<Int>(42)")).parseExpression()).toEqual({
            kind: "CallExpression",
            callee: { kind: "Identifier", name: "f" },
            typeArgs: [{ kind: "BuiltinType", name: "Int" }],
            args: [{ kind: "IntegerLiteral", value: 42 }]
        })
    })

    it("parses a type-instantiated call with multiple type args", () => {
        expect(new Parser(tokenize("f<Int, Boolean>(x)")).parseExpression()).toEqual({
            kind: "CallExpression",
            callee: { kind: "Identifier", name: "f" },
            typeArgs: [
                { kind: "BuiltinType", name: "Int" },
                { kind: "BuiltinType", name: "Boolean" }
            ],
            args: [{ kind: "Identifier", name: "x" }]
        })
    })

    it("parses chained calls", () => {
        expect(new Parser(tokenize("f(x)(y)")).parseExpression()).toEqual({
            kind: "CallExpression",
            callee: {
                kind: "CallExpression",
                callee: { kind: "Identifier", name: "f" },
                typeArgs: [],
                args: [{ kind: "Identifier", name: "x" }]
            },
            typeArgs: [],
            args: [{ kind: "Identifier", name: "y" }]
        })
    })

    it("treats a < b as comparison, not a call", () => {
        expect(new Parser(tokenize("a < b")).parseExpression()).toEqual({
            kind: "BinaryExpression",
            operator: "<",
            left: { kind: "Identifier", name: "a" },
            right: { kind: "Identifier", name: "b" }
        })
    })
})

// ============================================================
// println
// ============================================================

describe("println", () => {
    it("parses println with an integer argument", () => {
        expect(new Parser(tokenize("println(42)")).parseExpression()).toEqual({
            kind: "PrintlnExpression",
            arg: { kind: "IntegerLiteral", value: 42 }
        })
    })

    it("parses println with an expression argument", () => {
        expect(new Parser(tokenize("println(x + 1)")).parseExpression()).toEqual({
            kind: "PrintlnExpression",
            arg: {
                kind: "BinaryExpression",
                operator: "+",
                left: { kind: "Identifier", name: "x" },
                right: { kind: "IntegerLiteral", value: 1 }
            }
        })
    })

    it("throws on missing closing paren in println", () => {
        expect(() => new Parser(tokenize("println(42")).parseExpression()).toThrow()
    })
})

// ============================================================
// Lambda expressions
// ============================================================

describe("LambdaExpression", () => {
    it("parses a zero-parameter lambda", () => {
        expect(new Parser(tokenize("() => 42")).parseExpression()).toEqual({
            kind: "LambdaExpression",
            params: [],
            body: { kind: "IntegerLiteral", value: 42 }
        })
    })

    it("parses a one-parameter lambda", () => {
        expect(new Parser(tokenize("(x: Int) => x")).parseExpression()).toEqual({
            kind: "LambdaExpression",
            params: [{ name: "x", type: { kind: "BuiltinType", name: "Int" } }],
            body: { kind: "Identifier", name: "x" }
        })
    })

    it("parses a multi-parameter lambda", () => {
        expect(new Parser(tokenize("(x: Int, y: Boolean) => x")).parseExpression()).toEqual({
            kind: "LambdaExpression",
            params: [
                { name: "x", type: { kind: "BuiltinType", name: "Int" } },
                { name: "y", type: { kind: "BuiltinType", name: "Boolean" } }
            ],
            body: { kind: "Identifier", name: "x" }
        })
    })
})

// ============================================================
// Block expressions
// ============================================================

describe("BlockExpression", () => {
    it("parses a block with no statements", () => {
        expect(new Parser(tokenize("{ 42 }")).parseExpression()).toEqual({
            kind: "BlockExpression",
            stmts: [],
            expr: { kind: "IntegerLiteral", value: 42 }
        })
    })

    it("parses a block with a var declaration and assignment", () => {
        expect(new Parser(tokenize("{ var x: Int = 0; x = 5; x }")).parseExpression()).toEqual({
            kind: "BlockExpression",
            stmts: [
                {
                    kind: "VarStatement",
                    name: "x",
                    type: { kind: "BuiltinType", name: "Int" },
                    value: { kind: "IntegerLiteral", value: 0 }
                },
                {
                    kind: "AssignStatement",
                    name: "x",
                    value: { kind: "IntegerLiteral", value: 5 }
                }
            ],
            expr: { kind: "Identifier", name: "x" }
        })
    })

    it("throws on missing closing brace", () => {
        expect(() => new Parser(tokenize("{ 42")).parseExpression()).toThrow()
    })
})

// ============================================================
// Match expressions
// ============================================================

describe("MatchExpression", () => {
    it("parses a match with a wildcard case", () => {
        expect(new Parser(tokenize("match x { case _ => 0 }")).parseExpression()).toEqual({
            kind: "MatchExpression",
            subject: { kind: "Identifier", name: "x" },
            cases: [{
                pattern: { kind: "WildcardPattern" },
                body: { kind: "IntegerLiteral", value: 0 }
            }]
        })
    })

    it("parses a match with a variable pattern", () => {
        expect(new Parser(tokenize("match x { case n => n }")).parseExpression()).toEqual({
            kind: "MatchExpression",
            subject: { kind: "Identifier", name: "x" },
            cases: [{
                pattern: { kind: "VariablePattern", name: "n" },
                body: { kind: "Identifier", name: "n" }
            }]
        })
    })

    it("parses a match with a constructor pattern", () => {
        expect(new Parser(tokenize("match x { case Some(n) => n }")).parseExpression()).toEqual({
            kind: "MatchExpression",
            subject: { kind: "Identifier", name: "x" },
            cases: [{
                pattern: {
                    kind: "ConstructorPattern",
                    constructorName: "Some",
                    args: [{ kind: "VariablePattern", name: "n" }]
                },
                body: { kind: "Identifier", name: "n" }
            }]
        })
    })

    it("parses a match with multiple cases", () => {
        expect(new Parser(tokenize("match x { case Some(n) => n case _ => 0 }")).parseExpression()).toEqual({
            kind: "MatchExpression",
            subject: { kind: "Identifier", name: "x" },
            cases: [
                {
                    pattern: {
                        kind: "ConstructorPattern",
                        constructorName: "Some",
                        args: [{ kind: "VariablePattern", name: "n" }]
                    },
                    body: { kind: "Identifier", name: "n" }
                },
                {
                    pattern: { kind: "WildcardPattern" },
                    body: { kind: "IntegerLiteral", value: 0 }
                }
            ]
        })
    })

    it("parses a constructor pattern with no args", () => {
        expect(new Parser(tokenize("match x { case None() => 0 }")).parseExpression()).toEqual({
            kind: "MatchExpression",
            subject: { kind: "Identifier", name: "x" },
            cases: [{
                pattern: {
                    kind: "ConstructorPattern",
                    constructorName: "None",
                    args: []
                },
                body: { kind: "IntegerLiteral", value: 0 }
            }]
        })
    })

    it("parses a constructor pattern with multiple args", () => {
        expect(new Parser(tokenize("match x { case Pair(a, b) => a }")).parseExpression()).toEqual({
            kind: "MatchExpression",
            subject: { kind: "Identifier", name: "x" },
            cases: [{
                pattern: {
                    kind: "ConstructorPattern",
                    constructorName: "Pair",
                    args: [
                        { kind: "VariablePattern", name: "a" },
                        { kind: "VariablePattern", name: "b" }
                    ]
                },
                body: { kind: "Identifier", name: "a" }
            }]
        })
    })

    it("throws on an invalid pattern", () => {
        expect(() => new Parser(tokenize("match x { case 42 => 0 }")).parseExpression()).toThrow()
    })

    it("throws on match with no cases", () => {
        expect(() => new Parser(tokenize("match x { }")).parseExpression()).toThrow()
    })
})

// ============================================================
// parseStatement (exercised via block)
// ============================================================

describe("parseStatement (via block)", () => {
    it("parses a val statement", () => {
        expect(new Parser(tokenize("{ val x: Int = 42; x }")).parseExpression()).toMatchObject({
            stmts: [{
                kind: "ValStatement",
                name: "x",
                type: { kind: "BuiltinType", name: "Int" },
                value: { kind: "IntegerLiteral", value: 42 }
            }]
        })
    })

    it("parses a var statement", () => {
        expect(new Parser(tokenize("{ var flag: Boolean = false; flag }")).parseExpression()).toMatchObject({
            stmts: [{
                kind: "VarStatement",
                name: "flag",
                type: { kind: "BuiltinType", name: "Boolean" },
                value: { kind: "BooleanLiteral", value: false }
            }]
        })
    })

    it("parses an assignment statement", () => {
        expect(new Parser(tokenize("{ var x: Int = 0; x = 99; x }")).parseExpression()).toMatchObject({
            stmts: [
                { kind: "VarStatement" },
                {
                    kind: "AssignStatement",
                    name: "x",
                    value: { kind: "IntegerLiteral", value: 99 }
                }
            ]
        })
    })

    it("throws on val declaration missing semicolon", () => {
        expect(() => new Parser(tokenize("{ val x: Int = 1 x }")).parseExpression()).toThrow()
    })
})

// ============================================================
// parseFuncDef
// ============================================================

describe("parseFuncDef", () => {
    it("parses a simple function with one parameter", () => {
        expect(new Parser(tokenize("def double(x: Int): Int = x + x;")).parseFuncDef()).toEqual({
            kind: "FuncDef",
            name: "double",
            typeParams: [],
            params: [{ name: "x", type: { kind: "BuiltinType", name: "Int" } }],
            returnType: { kind: "BuiltinType", name: "Int" },
            body: {
                kind: "BinaryExpression",
                operator: "+",
                left: { kind: "Identifier", name: "x" },
                right: { kind: "Identifier", name: "x" }
            }
        })
    })

    it("parses a zero-parameter function", () => {
        expect(new Parser(tokenize("def getUnit(): Unit = unit;")).parseFuncDef()).toEqual({
            kind: "FuncDef",
            name: "getUnit",
            typeParams: [],
            params: [],
            returnType: { kind: "BuiltinType", name: "Unit" },
            body: { kind: "UnitLiteral" }
        })
    })

    it("parses a function with type parameters", () => {
        expect(new Parser(tokenize("def id<a>(x: a): a = x;")).parseFuncDef()).toEqual({
            kind: "FuncDef",
            name: "id",
            typeParams: ["a"],
            params: [{ name: "x", type: { kind: "TypeVariable", name: "a" } }],
            returnType: { kind: "TypeVariable", name: "a" },
            body: { kind: "Identifier", name: "x" }
        })
    })

    it("parses a function with multiple parameters", () => {
        expect(new Parser(tokenize("def add(x: Int, y: Int): Int = x + y;")).parseFuncDef()).toEqual({
            kind: "FuncDef",
            name: "add",
            typeParams: [],
            params: [
                { name: "x", type: { kind: "BuiltinType", name: "Int" } },
                { name: "y", type: { kind: "BuiltinType", name: "Int" } }
            ],
            returnType: { kind: "BuiltinType", name: "Int" },
            body: {
                kind: "BinaryExpression",
                operator: "+",
                left: { kind: "Identifier", name: "x" },
                right: { kind: "Identifier", name: "y" }
            }
        })
    })

    it("parses a function with multiple type parameters", () => {
        expect(new Parser(tokenize("def first<a, b>(x: a, y: b): a = x;")).parseFuncDef()).toEqual({
            kind: "FuncDef",
            name: "first",
            typeParams: ["a", "b"],
            params: [
                { name: "x", type: { kind: "TypeVariable", name: "a" } },
                { name: "y", type: { kind: "TypeVariable", name: "b" } }
            ],
            returnType: { kind: "TypeVariable", name: "a" },
            body: { kind: "Identifier", name: "x" }
        })
    })

    it("throws on missing semicolon after function body", () => {
        expect(() => new Parser(tokenize("def f(x: Int): Int = x")).parseFuncDef()).toThrow()
    })
})

// ============================================================
// parseAlgDef
// ============================================================

describe("parseAlgDef", () => {
    it("parses an algdef with one constructor", () => {
        expect(new Parser(tokenize("algdef Color { Red() }")).parseAlgDef()).toEqual({
            kind: "AlgDef",
            name: "Color",
            typeParams: [],
            constructors: [{ name: "Red", params: [] }]
        })
    })

    it("parses an algdef with multiple constructors", () => {
        expect(new Parser(tokenize("algdef Shape { Circle(Int), Rect(Int, Int) }")).parseAlgDef()).toEqual({
            kind: "AlgDef",
            name: "Shape",
            typeParams: [],
            constructors: [
                { name: "Circle", params: [{ kind: "BuiltinType", name: "Int" }] },
                { name: "Rect", params: [{ kind: "BuiltinType", name: "Int" }, { kind: "BuiltinType", name: "Int" }] }
            ]
        })
    })

    it("parses an algdef with a type parameter", () => {
        expect(new Parser(tokenize("algdef Option<a> { Some(a), None() }")).parseAlgDef()).toEqual({
            kind: "AlgDef",
            name: "Option",
            typeParams: ["a"],
            constructors: [
                { name: "Some", params: [{ kind: "TypeVariable", name: "a" }] },
                { name: "None", params: [] }
            ]
        })
    })

    it("parses an algdef with multiple type parameters", () => {
        expect(new Parser(tokenize("algdef Either<a, b> { Left(a), Right(b) }")).parseAlgDef()).toEqual({
            kind: "AlgDef",
            name: "Either",
            typeParams: ["a", "b"],
            constructors: [
                { name: "Left", params: [{ kind: "TypeVariable", name: "a" }] },
                { name: "Right", params: [{ kind: "TypeVariable", name: "b" }] }
            ]
        })
    })

    it("throws on algdef with no constructors", () => {
        expect(() => new Parser(tokenize("algdef Empty { }")).parseAlgDef()).toThrow()
    })
})

// ============================================================
// parseProgram
// ============================================================

describe("parseProgram", () => {
    it("parses a program that is just an expression", () => {
        expect(new Parser(tokenize("42")).parseProgram()).toEqual({
            kind: "Program",
            algDefs: [],
            funcDefs: [],
            expr: { kind: "IntegerLiteral", value: 42 }
        })
    })

    it("parses a program with one function definition", () => {
        expect(new Parser(tokenize("def add(x: Int, y: Int): Int = x + y; add(1, 2)")).parseProgram()).toEqual({
            kind: "Program",
            algDefs: [],
            funcDefs: [{
                kind: "FuncDef",
                name: "add",
                typeParams: [],
                params: [
                    { name: "x", type: { kind: "BuiltinType", name: "Int" } },
                    { name: "y", type: { kind: "BuiltinType", name: "Int" } }
                ],
                returnType: { kind: "BuiltinType", name: "Int" },
                body: {
                    kind: "BinaryExpression",
                    operator: "+",
                    left: { kind: "Identifier", name: "x" },
                    right: { kind: "Identifier", name: "y" }
                }
            }],
            expr: {
                kind: "CallExpression",
                callee: { kind: "Identifier", name: "add" },
                typeArgs: [],
                args: [
                    { kind: "IntegerLiteral", value: 1 },
                    { kind: "IntegerLiteral", value: 2 }
                ]
            }
        })
    })

    it("parses a program with an algdef and a funcdef", () => {
        const src = "algdef Color { Red() } def pick(): Color = Red(); pick()"
        const program = new Parser(tokenize(src)).parseProgram()
        expect(program.kind).toBe("Program")
        expect(program.algDefs).toHaveLength(1)
        expect(program.algDefs[0].name).toBe("Color")
        expect(program.funcDefs).toHaveLength(1)
        expect(program.funcDefs[0].name).toBe("pick")
        expect(program.expr).toMatchObject({
            kind: "CallExpression",
            callee: { kind: "Identifier", name: "pick" }
        })
    })

    it("throws on extra tokens after program expression", () => {
        expect(() => new Parser(tokenize("42 43")).parseProgram()).toThrow()
    })
})
