// 使用 WeakMap 代替 Set 作为桶的数据结构
// WeakMap 与 Map 的区别有2点：
// 1.WeakMap 只接受对象作为键名（null除外）
// 2.WeakMap 的键名所指向的对象，不计入垃圾回收机制
// https://es6.ruanyifeng.com/#docs/set-map#WeakMap
let registerEffectCount = 0

// 存储副作用函数的桶
const bucket = new WeakMap()
let temp1, temp2

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = [] // 新增

const effect = (fn) => {
    const effectFn = () => {
        // 调用 cleanup 函数完成清除工作
        cleanup(effectFn) // 新增

        // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
        activeEffect = effectFn

        // 在调用副作用函数之前将当前副作用函数压入栈中
        effectStack.push(effectFn)
        
        fn()

        // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
        effectStack.pop() // 新增
        activeEffect = effectStack[effectStack.length - 1] // 新增
    }

    // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
    effectFn.deps = []
    effectFn.id = ++registerEffectCount

    // 执行副作用函数
    effectFn()
}

function cleanup (effectFn) {
    // 遍历 effectFn.deps 数组
    for (let i = 0; i < effectFn.deps.length; i++) {
        // deps 是依赖集合
        const deps = effectFn.deps[i]
        // 将 effectFn 从依赖集合中移除
        deps.delete(effectFn)
    }

    // 最后需要重置 effectFn.deps 数组
    effectFn.deps.length = 0
}

// 原始数据
const data = { foo: true, bar: true }

const obj = new Proxy(data, {
    // 拦截读取操作
    get (target, key) {
        // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
        track(target, key)

        // 返回属性值
        return target[key]
    },

    // 拦截设置操作
    set (target, key, newVal) {
        // 设置属性值
        target[key] = newVal

        // 把副作用函数从桶里取出并执行
        trigger(target, key)
    }
})

// 在 get 拦截函数内调用 track 函数追踪变化
function track (target, key) {
    // 没有 activeEffect ，直接 return
    if (!activeEffect) return

    let depsMap = bucket.get(target)

    if (!depsMap) {
        bucket.set(target, (depsMap = new Map()))
    }

    let deps = depsMap.get(key)
    if (!deps) {
        depsMap.set(key, (deps = new Set()))
    }

    // 把当前激活的副作用函数添加到依赖集合 deps 中
    deps.add(activeEffect)

    // deps 就是一个与当前副作用函数存在联系的依赖集合
    // 将其添加到 activeEffect.deps 数组中
    activeEffect.deps.push(deps) // 新增
}

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger (target, key) {
    const depsMap = bucket.get(target)
    if (!depsMap) return

    const effects = depsMap.get(key)

    const effectsToRun = new Set(effects) // 新增
    effectsToRun.forEach(effectFn => effectFn()) // 新增
    // effects && effects.forEach(fn => fn())
}




// 注册副作用函数
effect(function effectFn1() {
    console.log('effectFn1 执行')

    effect(function effectFn2() {
        console.log('effectFn2 执行')
        temp2 = obj.bar
    })

    temp1 = obj.foo
})

// obj.foo = 'foo'

/**
 * 疑问：
 * 1. 当执行 obj.foo = 'foo' 时，运行 effect(function effectFn2(){...})，
 * 因此 bar 的依赖集合中又新增了一个新的副作用函数,
 * 所以当修改 obj.bar 的值，会运行两次 “effectFn2 执行”
 * 
 * 再重复以上操作，bar 的依赖集合又新增1次，这样是不是有问题?
 * 
 * 想法：
 * 注册副作用函数 effect 中的 activeEffect = effectStack[effectStack.length - 1] 很妙啊
 * 对于之前的脚本我有个疑问：注册完副作用函数后 activeEffect 中始终是最后一次注册的函数，
 * 
 * 这段代码起到了两个作用：
 * 1. 如果是非嵌套函数，在注册流程结束后（即第40行代码），effectStack 栈已经被清空，
 * 那么 activeEffect = effectStack[effectStack.length - 1] 值就为 undefined，
 * 那么后续执行读取操作时，比如 let a = obj.foo，在执行到 get 时，因为 activeEffect 为undefined，
 * 就只会执行返回值操作 return target[key]（66行）
 * 
 * 2. 如果时嵌套 effect 注册，那么执行完内层的副作用函数后，
 * 会始终把当前最外层的副作用函数作为 activeEffect 的值，这样就不会收集错误
 */