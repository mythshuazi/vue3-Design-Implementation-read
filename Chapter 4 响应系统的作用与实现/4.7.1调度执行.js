// 使用 WeakMap 代替 Set 作为桶的数据结构
// WeakMap 与 Map 的区别有2点：
// 1.WeakMap 只接受对象作为键名（null除外）
// 2.WeakMap 的键名所指向的对象，不计入垃圾回收机制
// https://es6.ruanyifeng.com/#docs/set-map#WeakMap

// 存储副作用函数的桶
const bucket = new WeakMap()
let temp1, temp2

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = []

const effect = (fn, options) => {
    const effectFn = () => {
        // 调用 cleanup 函数完成清除工作
        cleanup(effectFn)

        // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
        activeEffect = effectFn

        // 在调用副作用函数之前将当前副作用函数压入栈中
        effectStack.push(effectFn)
        
        fn()

        // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
        effectStack.pop() 
        activeEffect = effectStack[effectStack.length - 1]
    }

    // 将 options 挂在到 effectFn 上
    effectFn.options = options // 新增

    // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
    effectFn.deps = []

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
const data = { foo: 1 }

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
    activeEffect.deps.push(deps)
}

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger (target, key) {
    const depsMap = bucket.get(target)
    if (!depsMap) return

    const effects = depsMap.get(key)

    const effectsToRun = new Set()
    effects && effects.forEach(effectFn => {
        if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
        }
    })
    effectsToRun.forEach(effectFn => {
        // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
        if (effectFn.options.scheduler) { // 新增
            effectFn.options.scheduler(effectFn) // 新增
        } else {
            effectFn()
        }
    })
}




// 注册副作用函数
effect(
    () => {
        console.log(obj.foo)
    },
    // options
    {
        // 调度器 scheduler 是一个函数
        scheduler(fn) {
            setTimeout(fn)
        }
    }
)

obj.foo++

console.log('结束了')

/**
 * 
 */