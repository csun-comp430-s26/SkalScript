import {
  Program,
  Expression,
  Statement,
  Type,
  BuiltinType,
  TypeVariable,
  AlgebraicType,
  FunctionType,
  Pattern,
  Param,
  AlgDef,
  FuncDef,
} from "../parser/AST"

type VarInfo = {
  type: Type
  mutable: boolean
}

type PolyFunction = {
  typeParams: string[]
  fn: FunctionType
}

type Env = {
  vars: Map<string, VarInfo>
  funcs: Map<string, PolyFunction>
  adts: Map<string, AlgDef>
  constructors: Map<string, PolyFunction>
  typeVars: Set<string>
}

export class TypeChecker {

  private env: Env

  constructor() {
    this.env = {
      vars: new Map(),
      funcs: new Map(),
      adts: new Map(),
      constructors: new Map(),
      typeVars: new Set(),
    }
  }

  /// PROGRAM ///

  checkProgram(p: Program): Type {

    this.reset()

    /// REGISTER ADTS ///
    for (const adt of p.algDefs) {

      this.ensureUniqueTypeParams(
        adt.typeParams,
        `algdef ${adt.name}`
      )

      if (this.env.adts.has(adt.name)) {
        throw new Error(`Duplicate ADT: ${adt.name}`)
      }

      this.env.adts.set(adt.name, adt)

      for (const ctor of adt.constructors) {

        if (this.env.constructors.has(ctor.name)) {
          throw new Error(`Duplicate constructor: ${ctor.name}`)
        }

        const returnType: AlgebraicType = {
          kind: "AlgebraicType",
          name: adt.name,
          typeArgs: adt.typeParams.map(tp => ({
            kind: "TypeVariable",
            name: tp
          }))
        }

        this.env.constructors.set(
          ctor.name,
          {
            typeParams: adt.typeParams,
            fn: {
              kind: "FunctionType",
              paramTypes: ctor.params,
              returnType
            }
          }
        )
      }
    }

    /// VALIDATE ADT CONSTRUCTOR PARAMETER TYPES ///
    // Separate pass: a constructor may reference an ADT that is
    // declared later in the program, so every ADT must be registered
    // before any constructor parameter type can be validated.
    for (const adt of p.algDefs) {

      const savedTypeVars = this.env.typeVars
      this.env.typeVars = new Set(adt.typeParams)

      for (const ctor of adt.constructors) {
        for (const paramType of ctor.params) {
          this.validateType(paramType)
        }
      }

      this.env.typeVars = savedTypeVars
    }

    /// REGISTER FUNCTIONS ///
    for (const fn of p.funcDefs) {

      this.ensureUniqueTypeParams(
        fn.typeParams,
        `function ${fn.name}`
      )

      if (this.env.funcs.has(fn.name)) {
        throw new Error(`Duplicate function: ${fn.name}`)
      }

      if (this.env.constructors.has(fn.name)) {
        throw new Error(
          `Function ${fn.name} conflicts with a constructor of the same name`
        )
      }

      this.env.funcs.set(
        fn.name,
        {
          typeParams: fn.typeParams,
          fn: {
            kind: "FunctionType",
            paramTypes: fn.params.map(p => p.type),
            returnType: fn.returnType
          }
        }
      )
    }

    /// CHECK FUNCTION BODIES ///
    for (const fn of p.funcDefs) {
      this.checkFunctionDef(fn)
    }

    /// ENTRY EXPRESSION ///
    return this.typeOf(p.expr)
  }

  /// RESET ///

  private reset(): void {
    this.env.vars.clear()
    this.env.funcs.clear()
    this.env.adts.clear()
    this.env.constructors.clear()
    this.env.typeVars.clear()
  }

  /// FUNCTION DEFINITIONS ///

  private checkFunctionDef(fn: FuncDef): void {

    const savedVars = new Map(this.env.vars)
    const savedTypeVars = new Set(this.env.typeVars)

    fn.typeParams.forEach(tp => {
      this.env.typeVars.add(tp)
    })

    this.ensureUniqueParamNames(fn.params, `function ${fn.name}`)

    for (const p of fn.params) {

      this.validateType(p.type)

      this.env.vars.set(p.name, {
        type: p.type,
        mutable: false
      })
    }

    this.validateType(fn.returnType)

    const actual = this.typeOf(fn.body)

    this.expect(actual, fn.returnType)

    this.env.vars = savedVars
    this.env.typeVars = savedTypeVars
  }

  /// EXPRESSIONS ///

  typeOf(e: Expression): Type {

    switch (e.kind) {

      /// LITERALS ///
      case "IntegerLiteral":
        return this.intType()

      case "BooleanLiteral":
        return this.boolType()

      case "UnitLiteral":
        return this.unitType()

      /// IDENTIFIER ///
      case "Identifier": {

        const v = this.env.vars.get(e.name)
        if (v) return v.type

        const f = this.env.funcs.get(e.name)
        if (f) {
          if (f.typeParams.length > 0) {
            throw new Error(
              `Generic function ${e.name} cannot be used as a value; ` +
              `call it with explicit type arguments`
            )
          }
          return f.fn
        }

        const c = this.env.constructors.get(e.name)
        if (c) {
          if (c.typeParams.length > 0) {
            throw new Error(
              `Generic constructor ${e.name} cannot be used as a value; ` +
              `call it with explicit type arguments`
            )
          }
          return c.fn
        }

        throw new Error(`Unknown identifier: ${e.name}`)
      }

      /// BINARY EXPRESSIONS ///
      case "BinaryExpression": {

        const left = this.typeOf(e.left)
        const right = this.typeOf(e.right)

        switch (e.operator) {

          case "+":
          case "-":
          case "*":
          case "/":
            this.expect(left, this.intType())
            this.expect(right, this.intType())
            return this.intType()

          case "<":
          case ">":
            this.expect(left, this.intType())
            this.expect(right, this.intType())
            return this.boolType()

          case "==":
            this.expect(left, right)
            return this.boolType()
        }

        throw new Error(`Unknown operator: ${e.operator}`)
      }

      /// FUNCTION CALLS ///
      case "CallExpression": {

        let poly: PolyFunction | null = null

        // Only resolve to a named function/constructor when the callee
        // is not shadowed by a local variable.
        if (
          e.callee.kind === "Identifier" &&
          !this.env.vars.has(e.callee.name)
        ) {
          poly =
            this.env.funcs.get(e.callee.name) ??
            this.env.constructors.get(e.callee.name) ??
            null
        }

        if (!poly) {

          const t = this.typeOf(e.callee)

          if (t.kind !== "FunctionType") {
            throw new Error(
              `Attempted to call non-function of type ${this.showType(t)}`
            )
          }

          if (e.typeArgs.length > 0) {
            throw new Error(
              "Cannot apply type arguments to non-polymorphic function"
            )
          }

          return this.checkCall(t, e.args)
        }

        if (e.typeArgs.length !== poly.typeParams.length) {
          throw new Error(
            `Expected ${poly.typeParams.length} type arguments, got ${e.typeArgs.length}`
          )
        }

        e.typeArgs.forEach(t => this.validateType(t))

        const subst = new Map<string, Type>()

        poly.typeParams.forEach((tp, i) => {
          subst.set(tp, e.typeArgs[i])
        })

        const instantiated = this.substituteFunctionType(poly.fn, subst)

        return this.checkCall(instantiated, e.args)
      }

      /// PRINTLN ///
      case "PrintlnExpression":
        this.typeOf(e.arg)
        return this.unitType()

      /// LAMBDA ///
      case "LambdaExpression": {

        const saved = new Map(this.env.vars)

        this.ensureUniqueParamNames(e.params, `lambda`)

        for (const p of e.params) {
          this.validateType(p.type)

          this.env.vars.set(p.name, {
            type: p.type,
            mutable: false
          })
        }

        const body = this.typeOf(e.body)

        this.env.vars = saved

        return {
          kind: "FunctionType",
          paramTypes: e.params.map(p => p.type),
          returnType: body
        }
      }

      /// BLOCK ///
      case "BlockExpression": {

        const saved = new Map(this.env.vars)

        for (const s of e.stmts) {
          this.execStmt(s)
        }

        const result = this.typeOf(e.expr)

        this.env.vars = saved

        return result
      }

      /// MATCH ///
      case "MatchExpression": {

        const subject = this.typeOf(e.subject)

        let result: Type | null = null

        for (const c of e.cases) {

          const saved = new Map(this.env.vars)

          this.typeOfPattern(c.pattern, subject, new Set())

          const bodyType = this.typeOf(c.body)

          this.env.vars = saved

          if (!result) result = bodyType
          else this.expect(bodyType, result)
        }

        if (!result) {
          throw new Error("Empty match expression")
        }

        this.checkExhaustive(subject, e.cases)

        return result
      }
    }

    const _exhaustive: never = e
    throw new Error(`Unhandled expression kind: ${(_exhaustive as Expression).kind}`)
  }

  /// CALLS ///
  private checkCall(fn: FunctionType, args: Expression[]): Type {

    if (fn.paramTypes.length !== args.length) {
      throw new Error(
        `Expected ${fn.paramTypes.length} arguments, got ${args.length}`
      )
    }

    args.forEach((arg, i) => {
      const actual = this.typeOf(arg)
      this.expect(actual, fn.paramTypes[i])
    })

    return fn.returnType
  }

  /// STATEMENTS ///
  private execStmt(s: Statement): void {

    switch (s.kind) {

      case "ValStatement": {

        this.validateType(s.type)

        const actual = this.typeOf(s.value)

        this.expect(actual, s.type)

        this.env.vars.set(s.name, {
          type: s.type,
          mutable: false
        })

        return
      }

      case "VarStatement": {

        this.validateType(s.type)

        const actual = this.typeOf(s.value)

        this.expect(actual, s.type)

        this.env.vars.set(s.name, {
          type: s.type,
          mutable: true
        })

        return
      }

      case "AssignStatement": {

        const info = this.env.vars.get(s.name)

        if (!info) {
          throw new Error(`Unknown variable: ${s.name}`)
        }

        if (!info.mutable) {
          throw new Error(`Cannot assign to immutable val: ${s.name}`)
        }

        const actual = this.typeOf(s.value)

        this.expect(actual, info.type)

        return
      }
    }
  }

  /// PATTERNS ///
  private typeOfPattern(
    p: Pattern,
    expected: Type,
    locals: Set<string>
  ): void {

    switch (p.kind) {

      case "WildcardPattern":
        return

      case "VariablePattern": {

        if (locals.has(p.name)) {
          throw new Error(`Duplicate pattern variable: ${p.name}`)
        }

        locals.add(p.name)

        this.env.vars.set(p.name, {
          type: expected,
          mutable: false
        })

        return
      }

      case "ConstructorPattern": {

        const poly = this.env.constructors.get(p.constructorName)

        if (!poly) {
          throw new Error(`Unknown constructor: ${p.constructorName}`)
        }

        const subst = new Map<string, Type>()

        this.unify(poly.fn.returnType, expected, subst)

        const params = poly.fn.paramTypes.map(t =>
          this.substituteType(t, subst)
        )

        if (params.length !== p.args.length) {
          throw new Error("Pattern arity mismatch")
        }

        p.args.forEach((arg, i) => {
          this.typeOfPattern(arg, params[i], locals)
        })

        return
      }
    }
  }

  /// PATTERN EXHAUSTIVITY ///

  // Verifies that the cases of a match expression cover every possible value of the subject type.
  private checkExhaustive(
    subjectType: Type,
    cases: { pattern: Pattern }[]
  ): void {

    const matrix = cases.map(c => [c.pattern])

    const witness = this.exhaustivenessWitness(matrix, [subjectType])

    if (witness) {
      throw new Error(
        `Non-exhaustive match: no case covers ${this.showPattern(witness[0])}`
      )
    }
  }

  // Simplified Maranget-style witness search for the all-wildcard query vector.
  private exhaustivenessWitness(
    matrix: Pattern[][],
    colTypes: Type[]
  ): Pattern[] | null {

    // No columns left: covered iff a row remains.
    if (colTypes.length === 0) {
      return matrix.length === 0 ? [] : null
    }

    const headType = colTypes[0]
    const restTypes = colTypes.slice(1)
    const sigma = this.headConstructors(matrix)

    // Complete ADT column: recurse under each constructor.
    if (headType.kind === "AlgebraicType") {

      const allConstructors = this.constructorsForAlgebraicType(headType)
      const complete = allConstructors.every(c => sigma.has(c.name))

      if (complete) {

        for (const ctor of allConstructors) {

          const fieldTypes = this.constructorFieldTypes(
            ctor.name,
            headType
          )

          const subWitness = this.exhaustivenessWitness(
            this.specializeMatrix(ctor.name, fieldTypes.length, matrix),
            fieldTypes.concat(restTypes)
          )

          if (subWitness) {
            // Rewrap the constructor fields around the sub-witness.
            return [
              {
                kind: "ConstructorPattern",
                constructorName: ctor.name,
                args: subWitness.slice(0, fieldTypes.length)
              },
              ...subWitness.slice(fieldTypes.length)
            ]
          }
        }

        return null
      }
    }

    // Otherwise, only wildcard or variable rows can cover this column.
    const subWitness = this.exhaustivenessWitness(
      this.defaultMatrix(matrix),
      restTypes
    )

    if (!subWitness) {
      return null
    }

    // Rebuild the dropped column.
    if (headType.kind === "AlgebraicType" && sigma.size > 0) {

      const missing = this
        .constructorsForAlgebraicType(headType)
        .find(c => !sigma.has(c.name))

      if (missing) {
        const arity = this.constructorFieldTypes(
          missing.name,
          headType
        ).length

        return [
          {
            kind: "ConstructorPattern",
            constructorName: missing.name,
            args: this.wildcards(arity)
          },
          ...subWitness
        ]
      }
    }

    // Any value works for this column.
    return [{ kind: "WildcardPattern" }, ...subWitness]
  }

  // Constructors in column 0.
  private headConstructors(matrix: Pattern[][]): Set<string> {

    const result = new Set<string>()

    for (const row of matrix) {
      const head = row[0]
      if (head.kind === "ConstructorPattern") {
        result.add(head.constructorName)
      }
    }

    return result
  }

  // Specialize the matrix for a constructor.
  private specializeMatrix(
    ctorName: string,
    arity: number,
    matrix: Pattern[][]
  ): Pattern[][] {

    const result: Pattern[][] = []

    for (const row of matrix) {
      const head = row[0]
      const tail = row.slice(1)

      if (head.kind === "ConstructorPattern") {
        if (head.constructorName === ctorName) {
          result.push(head.args.concat(tail))
        }
      } else {
        result.push(this.wildcards(arity).concat(tail))
      }
    }

    return result
  }

  // Drop column 0 for wildcard and variable rows.
  private defaultMatrix(matrix: Pattern[][]): Pattern[][] {

    const result: Pattern[][] = []

    for (const row of matrix) {
      const head = row[0]
      if (
        head.kind === "WildcardPattern" ||
        head.kind === "VariablePattern"
      ) {
        result.push(row.slice(1))
      }
    }

    return result
  }

  // Constructor field types after substituting the ADT type arguments.
  private constructorFieldTypes(
    ctorName: string,
    algType: AlgebraicType
  ): Type[] {

    const poly = this.env.constructors.get(ctorName)

    if (!poly) {
      throw new Error(`Unknown constructor: ${ctorName}`)
    }

    const subst = new Map<string, Type>()

    this.unify(poly.fn.returnType, algType, subst)

    return poly.fn.paramTypes.map(t => this.substituteType(t, subst))
  }

  // All constructors declared for an algebraic data type.
  private constructorsForAlgebraicType(
    algType: AlgebraicType
  ): AlgDef["constructors"] {

    const adt = this.env.adts.get(algType.name)

    if (!adt) {
      throw new Error(`Internal error: unknown ADT ${algType.name}`)
    }

    return adt.constructors
  }

  // A vector of n wildcard patterns.
  private wildcards(n: number): Pattern[] {

    const result: Pattern[] = []

    for (let i = 0; i < n; i++) {
      result.push({ kind: "WildcardPattern" })
    }

    return result
  }

  // Renders a pattern for a non-exhaustive match error message.
  private showPattern(p: Pattern): string {

    switch (p.kind) {

      case "WildcardPattern":
        return "_"

      case "VariablePattern":
        return p.name

      case "ConstructorPattern":
        return `${p.constructorName}(${p.args
          .map(a => this.showPattern(a))
          .join(", ")})`
    }
  }

  /// TYPE VALIDATION ///
  private validateType(t: Type): void {

    switch (t.kind) {

      case "BuiltinType":
        return

      case "TypeVariable":

        if (!this.env.typeVars.has(t.name)) {
          throw new Error(`Unknown type variable: ${t.name}`)
        }

        return

      case "AlgebraicType": {

        const adt = this.env.adts.get(t.name)

        if (!adt) {
          throw new Error(`Unknown type: ${t.name}`)
        }

        if (adt.typeParams.length !== t.typeArgs.length) {
          throw new Error(`Wrong number of type arguments for ${t.name}`)
        }

        t.typeArgs.forEach(a => this.validateType(a))

        return
      }

      case "FunctionType":

        t.paramTypes.forEach(p => this.validateType(p))
        this.validateType(t.returnType)
        return
    }
  }

  /// TYPE PARAM HELPERS ///
  private ensureUniqueTypeParams(params: string[], context: string): void {

    const seen = new Set<string>()

    for (const p of params) {
      if (seen.has(p)) {
        throw new Error(`Duplicate type parameter ${p} in ${context}`)
      }
      seen.add(p)
    }
  }

  // Reject duplicate names in one parameter list.
  private ensureUniqueParamNames(params: Param[], context: string): void {

    const seen = new Set<string>()

    for (const p of params) {
      if (seen.has(p.name)) {
        throw new Error(`Duplicate parameter name ${p.name} in ${context}`)
      }
      seen.add(p.name)
    }
  }

  /// UNIFY ///
  private unify(
    pattern: Type,
    actual: Type,
    subst: Map<string, Type>
  ): void {

    if (pattern.kind === "TypeVariable") {

      const existing = subst.get(pattern.name)

      if (existing) {
        this.expect(existing, actual)
      } else {
        subst.set(pattern.name, actual)
      }

      return
    }

    if (pattern.kind !== actual.kind) {
      throw new Error(
        `Cannot unify ${this.showType(pattern)} with ${this.showType(actual)}`
      )
    }

    switch (pattern.kind) {

      case "BuiltinType": {
        const aa = actual as BuiltinType

        if (pattern.name !== aa.name) {
          throw new Error(
            `Cannot unify ${this.showType(pattern)} with ${this.showType(actual)}`
          )
        }

        return
      }

      case "AlgebraicType": {
        const aa = actual as AlgebraicType

        if (
          pattern.name !== aa.name ||
          pattern.typeArgs.length !== aa.typeArgs.length
        ) {
          throw new Error(
            `Cannot unify ${this.showType(pattern)} with ${this.showType(actual)}`
          )
        }

        pattern.typeArgs.forEach((t, i) =>
          this.unify(t, aa.typeArgs[i], subst)
        )

        return
      }

      case "FunctionType": {
        const aa = actual as FunctionType

        if (pattern.paramTypes.length !== aa.paramTypes.length) {
          throw new Error(
            `Cannot unify ${this.showType(pattern)} with ${this.showType(actual)}`
          )
        }

        pattern.paramTypes.forEach((t, i) =>
          this.unify(t, aa.paramTypes[i], subst)
        )

        this.unify(pattern.returnType, aa.returnType, subst)

        return
      }
    }
  }

  /// SUBSTITUTION ///
  private substituteType(t: Type, subst: Map<string, Type>): Type {

    switch (t.kind) {

      case "BuiltinType":
        return t

      case "TypeVariable":
        return subst.get(t.name) ?? t

      case "AlgebraicType":
        return {
          kind: "AlgebraicType",
          name: t.name,
          typeArgs: t.typeArgs.map(a =>
            this.substituteType(a, subst)
          )
        }

      case "FunctionType":
        return {
          kind: "FunctionType",
          paramTypes: t.paramTypes.map(p =>
            this.substituteType(p, subst)
          ),
          returnType: this.substituteType(t.returnType, subst)
        }
    }
  }

  private substituteFunctionType(
    fn: FunctionType,
    subst: Map<string, Type>
  ): FunctionType {

    return {
      kind: "FunctionType",
      paramTypes: fn.paramTypes.map(p =>
        this.substituteType(p, subst)
      ),
      returnType: this.substituteType(fn.returnType, subst)
    }
  }

  /// EXPECT ///
  private expect(actual: Type, expected: Type): void {

    if (!this.typeEquals(actual, expected)) {
      throw new Error(
        `Type mismatch:\nexpected ${this.showType(expected)}\ngot ${this.showType(actual)}`
      )
    }
  }

  /// TYPE EQUALITY ///
  private typeEquals(a: Type, b: Type): boolean {

    if (a.kind !== b.kind) return false

    switch (a.kind) {

      case "BuiltinType":
        return a.name === (b as BuiltinType).name

      case "TypeVariable":
        return a.name === (b as TypeVariable).name

      case "AlgebraicType": {
        const bb = b as AlgebraicType

        return (
          a.name === bb.name &&
          a.typeArgs.length === bb.typeArgs.length &&
          a.typeArgs.every((t, i) =>
            this.typeEquals(t, bb.typeArgs[i])
          )
        )
      }

      case "FunctionType": {
        const bb = b as FunctionType

        return (
          a.paramTypes.length === bb.paramTypes.length &&
          a.paramTypes.every((t, i) =>
            this.typeEquals(t, bb.paramTypes[i])
          ) &&
          this.typeEquals(a.returnType, bb.returnType)
        )
      }
    }
  }

  /// BUILTINS ///
  private intType(): BuiltinType {
    return { kind: "BuiltinType", name: "Int" }
  }

  private boolType(): BuiltinType {
    return { kind: "BuiltinType", name: "Boolean" }
  }

  private unitType(): BuiltinType {
    return { kind: "BuiltinType", name: "Unit" }
  }

  /// DEBUG ///
  private showType(t: Type): string {

    switch (t.kind) {

      case "BuiltinType":
        return t.name

      case "TypeVariable":
        return t.name

      case "AlgebraicType":
        return `${t.name}<${t.typeArgs
          .map(a => this.showType(a))
          .join(", ")}>`

      case "FunctionType":
        return `(${t.paramTypes
          .map(p => this.showType(p))
          .join(", ")}) => ${this.showType(t.returnType)}`
    }
  }
}
